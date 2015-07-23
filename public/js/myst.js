var myst = {
    
    //local caches
    panels: {},             //panel json
    audio:  {},
    video:  {},              //"video" elements, although I also add the properties start and end when used
    images: {},

    identity: null,         //string. client identity. usually four words. saved in local storage and (hopefully) unique to this user
    caching: true,          //boolean. client caching. when false does not locally cache in memory or localstorge
    ambience: null,         //the current background music/sound which persists between panels
    
    activepanel: {},        //a local deep copy of the current panel
    activepanelname: null,  //just the name of the active panel
    previouspanelname: null,    //just the name of the previous panel

    //video
    videoformats: {         //a collection of video filetypes and their mimetypes.
        'mp4':'video/mp4',
        'webm':'video/webm',
        'ogv':'video/ogg'
    },
    activeaudioformat: null,

    //asset path
    assetpath: '/assets/',

    //user states
    states: {},

    //touchback
    touchbackdata: {},               //data to post back to the server on either panel request or when timeout expires
    touchbacktimerlength: 2000,        //number of seconds to wait before callback to the server with post data (say if state was changed and the panel was not invalidated, server still needs to know)
    touchbacktimer: null,
    ontouchbackcomplete: null,       //optionally assign a function to fire when complete (sometimes used with panel exit to ensure client gets a changed state before exiting)

    //panel transitions 
    transitiontype: 'modern',       //classic | modern
    forcedtransition: null,         //programatically enforce a transition type for next transition

    //zoom
    zoomfactor: 1,              //zoom level of screen

    //zip mode
    zip: false,
    
    //audio
    audioformats: {
        'mp3':'audio/mp3',
        'ogg':'audio/ogg'
    },
    activevideoformat: null,    //the determined video file type to use
    muted: false,               //boolean. when muted no audio is played
    
    //game control
    activetimers:{},            //hash map to retrieve timers by id
    activeintervals:{},         //hash map to retrieve intervals by id

    animations: [],
    
    sessiontime:    new Date().getTime(),
    
    initialize: function(serverconfig) {
        var me = this, urlparams = me.jsonizeurlparameters(), startat = 'myst';

        //force clear local storage first
        if (me.has(urlparams, 'clear')) {
            localStorage.clear();
        }
        
        //retrieve identity
        me.identity = me.storage('identity');

        //a version mismatch will clear all cache except identity
        me.handleversion(serverconfig.version);

        //take asset path passed in to load/cache all our assets from.
        me.assetpath = serverconfig.assetpath;

        //retrieve game state values
        me.states = me.storage('states') || {};
        
        //all local storage is built using identity. without one all is invalid
        if (!me.defined(me.identity)) {
            localStorage.clear();
            me.console('No identity found')
        } else {
            me.console('identity: ' + me.identity);
        }
        
        if (me.has(urlparams, 'startat')) {
            startat = urlparams.startat;
        }

        if (me.has(urlparams, 'caching')) {
            me.caching = (urlparams.caching == 'true' ? true : false);
        }

        $(document).ready(function() {
            
            //determine which video mimetype to use for this browser
            $.each(me.videoformats, function(key, value) {
                if ((document.createElement('video')).canPlayType(value)) {
                    me.console('determied browser can play video type ' + value);
                    me.activevideoformat = {
                        mimetype: value,
                        filetype: key
                    };
                    return false; //break out once we find the first compatible format
                }
            });
            if (!me.isset(me.activevideoformat)) {
                me.console('no video format suitable for this browser', 'error');
            }
            
            //determine which audio mimetype to use for this browser
            $.each(me.audioformats, function(key, value) {
                if ((document.createElement('audio')).canPlayType(value)) {
                    me.console('determied browser can play audio type ' + value);
                    me.activeaudioformat = {
                        mimetype: value,
                        filetype: key
                    };
                    return false; //break out once we find the first compatible format
                }
            });
            if (!me.isset(me.activeaudioformat)) {
                me.console('no audio format suitable for this browser', 'error');
            }

            //construct screen controls
            me.buildcontrols();

            //check local storage for saved prefs. names MUST be function names with values as first param
            $.each(['mute','zoom','zipmode','transition'], function(index, item) {
                if (me.isset(me.storage(item))) {
                    me[item](me.storage(item));
                }
            });

            //render first screen
            me.render(startat, function() {
                
            });
            
        });
        
    },
    render: function(panelname, callback, options) {
        
        var dompanel = $('<div class="panel"></div>');
        me = this,
        onrendercomplete = [], //an array of functions to call when render is complete for this panel
        options = options || {};
        
        //put guard up for to prevent user interaction during recall and transition
        $('#guard').show();

        me.clearpanel(); //clears all current audio, video, timers, not panel

        //retieve panel data from soures (memory, local storage, server)
        me.recall(panelname, function(name, panel, source) {

            me.console('panel render ' + panelname + ' from ' + source + ':', panel);
            
            me.activepanelname = panelname;
            $.extend(true, me.activepanel, panel);

            //background
            if (me.has(panel, 'background')) {
                $(dompanel).css('background-image', 'url("' + me.assetpath + panel.background + '")');
            }

            //actions to call when render completes (preload extra panel/assets)
            if (me.has(panel, 'onrendercomplete')) {
                onrendercomplete.push(function() {
                    me.action(panel.onrendercomplete);
                });
            }
            
            //render content
            var drawtag = function(object) {

                //handle state considerations - they override default values for anything in this tag. they extend and override the object
                if (me.has(object, 'state')) {
                    //examine all local state values
                    $.each(me.states, function(state, statevalue) {
                        //check if the current state matches any of the states defined in this object
                        $.each(object.state, function(objectstate, objectstatevalue) {
                            if (state === objectstate) {
                                $.each(objectstatevalue, function(objectstateproperty, objectstatepropertyvalue) {
                                    if (statevalue === objectstateproperty) {
                                        //override default values with state values (recurrsive copy)
                                        $.extend(true, object, objectstatepropertyvalue);
                                    }
                                });
                            }
                        });
                    });
                }
                
                var element = document.createElement(object.tag);
                
                //video (needs to exist before attr and css so that they can override values from cache)
                if (object.tag === "video") {
                    var foundmimetype = false;
                    if (me.isset(me.activevideoformat)) {
                        //chech for cached video object in memory
                        if (me.has(me.video, object.src)) {
                            
                            element = me.video[object.src];

                            //in order to autoplay, wait for video element to exist in dom and its readystate to be 4
                            onrendercomplete.push(function() {
                                /*
                                  wait for video readyState to be 4 before playing (could still be loading)
                                  const unsigned short HAVE_NOTHING = 0;
                                  const unsigned short HAVE_METADATA = 1;
                                  const unsigned short HAVE_CURRENT_DATA = 2;
                                  const unsigned short HAVE_FUTURE_DATA = 3;
                                  const unsigned short HAVE_ENOUGH_DATA = 4;
                                */
                                me.mediaready(element, function() {
                                    //in order to set currentTime, we have to be ready
                                    if (me.has(object, 'start')) {
                                        element.start = parseFloat(object.start); //create property
                                        element.currentTime = element.start;
                                    }

                                    //the timeupdate event is useful for some of our operations
                                    //ff fires this event on each frame, saf and ch every 250ms
                                    element.addEventListener('timeupdate', function() {
                                        //handle the "end" property if
                                        if (me.isset(this.end)) {
                                            //console.log(this.currentTime + ' ' + this.end);
                                            if (this.currentTime >= this.end && !this.paused) {
                                                //if NOT loop, then pause at end
                                                if (!me.has(object, 'loop')) {
                                                    this.pause();
                                                    $(this).trigger('ended'); //fire ended event in this case
                                                } else {
                                                    //reset back to start if looping
                                                    this.currentTime = (me.isset(this.start)) ? this.start : 0;
                                                }
                                            }
                                        }
                                    }, false);

                                    if (me.has(object, 'autoplay')) {
                                        if (object.autoplay) {
                                            element.play();
                                        }
                                    }
                                });
                            });

                            if (me.has(object, 'end')) {
                                element.end = parseFloat(object.end); //create property
                            }

                            if (me.has(object, 'loop')) {
                                if (object.loop) {
                                    element.loop = true;
                                }
                            }

                            element.muted = me.muted;
                            
                        } else {
                            me.console('the video ' + object.src + ' was not found in video cache','error');
                        }
                    }
                }

                //attr
                if (me.has(object, 'attr')) {
                    $.each(object.attr, function(key, value) {
                        $(element).attr(key, value);
                    });
                }
                
                //css
                if (me.has(object, 'css')) {
                    $.each(object.css, function(key, value) {
                        switch (key) {
                            case 'cursor':
                                $(element).css('cursor', 'url("' + me.assetpath + 'cursors/' + value + '.png"), pointer');
                                break;
                            default:
                                $(element).css(key, value);
                                break;
                        }
                    });
                }
                
                //events
                if (me.has(object, 'events')) {
                    $.each(object.events, function(key, value) {
                        $(element).bind(key, function() {
                            me.action(value);
                        });
                    });
                }

                //animation
                if (me.has(object, 'animation')) {
                    if (me.has(object.animation, 'id')) {

                        //create animation object
                        var animobject = {

                            id: object.animation.id,
                            element: element,
                            rate: me.has(object.animation, 'rate') ? object.animation.rate : 100,
                            currentFrame: 0,
                            action: function(animobject) {

                                var bgpos   = $(animobject.element).css('background-position'),
                                    bgposs  = bgpos.split(' '),
                                    xpos    = parseInt(bgposs[0].replace(/[^0-9\.-]+/g,''), 10),
                                    ypos    = parseInt(bgposs[1].replace(/[^0-9\.-]+/g,''), 10),
                                    height  = parseInt($(element).css('height').replace(/\D/g,''), 10),
                                    width   = parseInt($(element).css('width').replace(/\D/g,''), 10),
                                    xmax    = object.animation.xmax,
                                    ymax    = object.animation.ymax;

                                //this logic considers the frame left to right, top to bottom
                                if (((xpos * -1) + width) < xmax) {
                                    //within x boundaries
                                    xpos = xpos - width;
                                } else {
                                    //reached end of x
                                    xpos = 0;
                                    if (((ypos * -1) + height) < ymax) {
                                        //within y boundaries
                                        ypos = ypos - height;
                                    } else {
                                        //reset y, this is an end condition
                                        ypos = 0;
                                        animobject.currentFrame = 0;
                                        if (me.has(object.animation, 'loop')) {
                                            if (!object.animation.loop) {
                                                me.action({'stopanimation': object.animation.id });
                                            }
                                        }
                                    }
                                }

                                //do we have an "endat" frame value?
                                if (me.has(object.animation, 'endat')) {
                                    if (object.animation.endat === animobject.currentFrame) {
                                        //if at end, stop or reset?
                                        if (me.has(object.animation, 'loop')) {
                                            animobject.currentFrame = 0;
                                            ypos = 0;
                                            xpos = 0;
                                        } else {
                                            me.action({'stopanimation': object.animation.id });
                                        }
                                    }
                                }

                                $(element).css('background-position', xpos + 'px ' + ypos + 'px');
                                animobject.currentFrame++;
                            }

                        };

                        if (me.has(object.animation, 'ended')) {
                            $.extend(animobject, {
                                'ended': object.animation.ended
                            });
                        }

                        me.animations.push(animobject); //push animation object into scene holder

                        if (me.has(object.animation, 'autoplay')) {
                            me.action({'playanimation': object.animation.id });
                        }

                    } else {
                        me.console('animation requires id, xmax and ymax', 'error');
                    }
                }
                
                if (me.has(object, 'content')) {
                    $.each(object.content, function() {
                        var html = drawtag(this);
                        if (html) {
                            $(element).append(html);
                        }
                    });
                }
                return element;
            };
            $.each(panel.content, function() {
                var html = drawtag(this);
                if (html) {
                    $(dompanel).append($('<div class="content"></div>').append(html));
                }
            });
            
            //navigation
            /*
            example:
                "navigation": [
                    {
                        "width": "127",
                        "height": "333",
                        "right": "0",
                        "goto": "@7",
                        "cursor": "right",
                        "ambience":"MUVaultSoundMov",
                        "volume": "0.2"
                    }
                ],
            */

            var buildNavigation = function(nav) {
                
                var i = 0, 
                    preloadpanels = [],
                    preloadaudio = [];
                var domnav = $('<div class="nav"></div>');
                
                $.each(panel.navigation, function(index, item) {

                    var goto;

                    //first figure out what the goto value is
                    if (item.goto) {
                        goto = item.goto;

                        //does goto have a [=x] value? if so, is found in state
                        if (goto.slice(0,2) === "[=" && goto.slice(-1) === "]") {
                            goto = goto.slice(2, -1);
                            if (me.states[goto]) {
                                goto = me.states[goto];
                            } else {
                                me.console('panel is asking for a value for state "' + goto + '" but none exists?');
                            }
                        }
                    }

                    //secondly, handle zip mode, the nav object will contain a "zipcode" member
                    if (item.zipcode) {
                        if (!me.zip) return; //bail when zip mode is disabled

                        //the qualifier for zip mode is that they have to have visited the panel first, the only way
                        //I can do this is to check local storage for the panel
                        if (!me.storage(goto)) return;
                    }

                    var div = $('<div></div>');

                    //look for specific css properties
                    div.css('width', item.width + 'px' || '0px');
                    div.css('height', item.height + 'px' || '0px');

                    if (item.top) {
                        div.css('top', item.top + 'px' || '0px');
                    }
                    if (item.left) {
                        div.css('left', item.left + 'px' || '0px');    
                    }
                    if (item.bottom) {
                        div.css('bottom', item.bottom + 'px' || '0px');
                    }
                    if (item.right) {
                        div.css('right', item.right + 'px' || '0px');
                    }
                    
                    //cursor?
                    div.css('cursor','url("' + me.assetpath + 'cursors/' + item.cursor + '.png"), pointer');

                    //ambience track. let's add it to the preload now
                    if (item.ambience) {
                        preloadaudio.push(item.ambience);
                    }

                    //event listener for goto completion and preload
                    if (goto) {

                        preloadpanels.push(goto); //add value to preload to preload this panel

                        //click event to go to next panel and handle ambience and/or volume change
                        $(div).click(function() {
                            me.action({
                                'exit': {
                                    'goto': goto,
                                    'direction': item.direction || item.cursor
                                }
                            });
                            if (item.ambience || item.volume) {
                                me.action({
                                    'ambience': {
                                        'track': item.ambience,
                                        'volume': parseInt(item.volume, 10) / 255 //using the values from the iphone db volume given 0-255 needs to be converted to 0-1
                                    }
                                });
                            }
                        });
                    }
                    //append to dom
                    $(domnav).append(div);
                });

                //preload goto panels and or audio
                me.action({
                    'preload': {
                        'panels': preloadpanels,
                        'audio': preloadaudio
                    }
                });

                return domnav; //return nav dom element
            };

            if (me.has(panel, 'navigation')) {
                $(dompanel).append($(buildNavigation(panel.navigation)));
            }


            //sometimes we have to specify ambient track on the panel itself, mostly throgh navgation though
            if (me.has(panel, 'ambience.track')) {
                me.action({ 
                    'ambience': {
                        'track': panel.ambience.track,
                        'volume': panel.ambience.volume || 1
                    }
                });
            }
            
            //dev notes
            if (me.has(panel, 'notes')) {
                me.console(panel.notes, 'info');
            }

            //transition panel in
            switch (me.forcedtransition || me.transitiontype) {
                case 'modern':
                    var outgoing = $('div.panel');
                    $('div.panel').before(dompanel); //inject new panel behind current
                    
                    var direction = options.direction || 'up';
                    var transition = function(outgoingto, incomingto, axis) {
                        var axis = axis === 'x' ? 'left' : 'top';
                        var animateout = {
                            'opacity': 0
                        };
                        animateout[axis] = outgoingto;
                        outgoing.animate(animateout, 500, 'swing', function() {
                            outgoing.remove();
                            $('#guard').hide();
                        });
                        var animatein = {};
                        animatein[axis] = 0;
                        dompanel.css(axis, incomingto + 'px').animate(animatein, 500, 'swing');
                    };

                    //based on direction, transition accordingly
                    switch (direction) {
                        case 'left':
                            transition(544, -544, 'x');
                            break;
                        case 'right':
                            transition(-544, 544, 'x');
                            break;
                        case 'above':
                            transition(333, -333, 'y');
                            break;
                        case 'down':
                            transition(-333, 333, 'y');
                            break;
                        default:
                            outgoing.fadeOut(500, function() {
                                outgoing.remove();
                                $('#guard').hide();
                            });
                            break;
                    }
                    break;
                default:
                    //like classic myst, hard transition from panel to panel
                    $('div.panel').before(dompanel).remove();
                    $('#guard').hide();
                    break;
            }
            me.forcedtransition = null; //reset to default for next time

            //run all on render complete functions
            $.each(onrendercomplete, function() {
                this();
            });
        });
    },
    clearpanel: function() {
        var me = this;

        //clear audio, video, animations and timers
        $.each(me.audio, function(key, value) {
            if (key !== me.ambience) {
                me.mediaready(value, function() {
                    value.volume = 1;
                    value.stop();
                    $(value).unbind();
                });
            }
        });
        $.each(me.video, function(key, value) {
            me.mediaready(value, function() {
                value.volume = 1;
                value.stop();
                $(value).unbind();
            });
        });
        $.each(me.activetimers, function(key, value) {
            clearTimeout(value);
        });
        $.each(me.activeintervals, function(key, value) {
            clearInterval(value);
        });
        $.each(me.animations, function(index, item) {
            if (me.has(item, 'interval')) {
                clearInterval(item.interval);
            }
        });
        me.activetimers = {};
        me.activeintervals = {};
        me.animations = [];
        me.previouspanelname = me.activepanelname;
        me.activepanel = {};
        me.activepanelname = null;
    },
    action: function(object) {
        var me = this,
            panel = me.activepanel,
            action = {

                preload: function(value) {
                //for the most part, panels is depricated since we examine the nav.goto list. use this to reload panels which are not used by nav
                if (me.has(value, 'panels')) {
                    //actually attempt to recall (from there we handle load from server)
                    me.recall(value.panels, function(name, panel, source) {
                        me.console('preload recalled panel ' + name + ' from ' + source);
                    });
                }
                if (me.has(value, 'images')) {
                    $.each(value.images, function() {
                        if (!me.has(me.images, this)) {
                            var img = new Image();
                            img.src = me.assetpath + this;
                            me.images[this] = img;
                        }
                    });
                }
                if (me.has(value, 'audio')) {
                    $.each(value.audio, function() {
                        var source = this.toString();
                        if (!me.has(me.audio, source) && me.isset(me.activeaudioformat)) {
                            var audio = new Audio();
                            audio.src = me.assetpath + "audio/" + source + "/" + source + "." + me.activeaudioformat.filetype;
                            audio.load();
                            audio.stop = function() {
                                this.pause();
                                this.currentTime = 0;
                            };
                            audio.muted = me.muted;
                            me.audio[source] = audio;
                        }
                    });
                }
                if (me.has(value, 'video')) {
                    $.each(value.video, function(index, item) {
                        if (!me.has(me.video, item) && me.isset(me.activevideoformat)) {
                            var video = document.createElement('video');
                            video.videoerror = myst.videoerror;
                            video.src = me.assetpath + "video/" + item + "/" + item + "." + me.activevideoformat.filetype;
                            video.load();
                            //create my custom properties! :)
                            video['stop'] = function() {
                                if (this.readyState === 4) {
                                    this.pause();
                                    this.currentTime = 0;
                                }
                            };
                            video['start'] = null;
                            video['end'] = null;
                            video.muted = me.muted;
                            me.video[item] = video;
                        }
                    });
                }
            },
                render: function(value) {
                me.render(value); //use carefully, perhaps exit is a better choice?
            },
                goto: function(value) {
                me.action({'exit':value});
            },
                /**
                 * exit with forcing a classic transition
                 */
                classicexit: function(value) {
                me.forcedtransition = 'classic';
                me.action({'exit': value });
            },
                /**
                 * occurs when user is leaving current panel by action or automation. on exit is called, and next panel render is initiated
                 * @param  {object} {"goto":{string}, "direction": {string}} goto is the panel id (or name) and direction is the cursor value
                 * @return {undef}
                 */
                exit: function(value) {
                //translate older number only input
                value = !me.defined(value, 'object') ? {"goto": value, "direction":"up"} : value;
                if (value.goto) {
                    //before rendering next panel, check for "onexit"
                    var exit = function() {
                        me.render(value.goto, null, {
                            'direction': value.direction || 'up'
                        });
                    };
                    if (me.has(panel, "onexit")) {
                        //put guard up for onexit events to prevent user interaction
                        $('#guard').show();

                        //setup wait for touchback interval, even if not used
                        var waitfortouchback = function() {
                            var checkOnTouchBackComplete = setInterval(function() {
                                //if not defined anymore (or never defined), it has fired and we can complete the exit
                                if (me.ontouchbackcomplete === null) {
                                    clearInterval(checkOnTouchBackComplete);
                                    $('#guard').hide();
                                    exit();
                                }
                            }, 10);
                        };

                        //if a waitforserver flag is set, create a callback function
                        if (me.has(panel.onexit, 'waitforserver') && panel.onexit.waitforserver) {
                            me.ontouchbackcomplete = function(response) {
                                me.console("ontouchbackcomplete fired with response:", response);
                            };
                        }

                        //if events are present, run them now.
                        if (me.has(panel.onexit, 'length') && me.has(panel.onexit, 'events')) {

                            me.action(panel.onexit.events); //some might include state changes so include this before touchback

                            setTimeout(function() {
                                waitfortouchback();
                            }, panel.onexit.length)
                        } else {
                            console.log('The onexit object requires both "length" and "events" members. optionally "waitforserver"','error');
                            waitfortouchback();
                        }

                        //finally, same check as above, if a wait for server flag is set, force the values to the server now. 
                        //its important to run onexit events first (above) in case they include states changes which we can send now
                        if (me.has(panel.onexit, 'waitforserver') && panel.onexit.waitforserver) {
                            me.dotouchback(); //force touchback values to server right away
                        }

                    } else {
                        exit();
                    }
                } else {
                    me.console('The "exit" action must take as a parameter an object with "goto" and optionally "direction" values', 'error');
                }
            },
                guard: function(value) {
                if (value) {
                    $('#guard').show();
                } else {
                    $('#guard').hide();
                }
            },
                show: function(value) {
                if ($(value).length > 0) {
                    $(value).show();
                } else {
                    me.console('Trying to show element "' + value + '", but none exist?', 'error');
                }
            },
                hide: function(value) {
                if ($(value).length > 0) {
                    $(value).hide();
                } else {
                    me.console('Trying to hide element "' + value + '", but none exist?', 'error');
                }
            },
                toggle: function(value) {
                if ($(value).length > 0) {
                    $(value).is(":visible") ? $(value).hide() : $(value).show();
                } else {
                    me.console('Trying to toggle element "' + value + '", but none exist?', 'error');
                }
            },
                random: function(value) {
                if (me.has(value, 'events')) {
                    me.action(value.events[Math.floor((Math.random() * (value.events.length - 1)))]);
                } else {
                    me.console('random requires events property as array of choices');
                }
            },
                visible: function(value) {
                $(value).css('visibility','visible');
            },
                invisible: function(value) {
                $(value).css('visibility','hidden');
            },
                swapbackground: function(value) {
                $('#panel').css('background-image','url("' + me.assetpath + value + '/bg.jpg")');
            },
                removebackground: function(value) {
                $('div.panel').css('background-image','none');
            },
                css: function(value) {
                $.each(value, function(key, valu) {
                    $.each(valu, function(a,b) {
                        $(key).css(a,b);
                    });
                });
            },
                playaudio: function(value) {

                    var track = value;
                    var playrate = 1;

                    //if string, string is audio value, if object, look for playrate 
                    if (me.defined(value, 'object') && value.track) {
                        track = value.track;
                        if (value.playrate) {
                            playrate = parseFloat(value.playrate);
                        }
                    }

                    if (me.has(me.audio, track)) {
                        var audio = me.audio[track];
                        me.mediaready(audio, function() {
                        audio.playbackRate = playrate;
                        audio.play();
                    });
                    }
                },
                //track or object with track and volume
                ambience: function(value) {
                
                //expecting { track: String. volume: Number }

                //handle track change
                var trackchange = function(volume) {
                    if (value.track && (value.track !== me.ambience)) {
                        
                        //stop current ambience
                        if (me.isset(me.ambience)) {
                            me.audio[me.ambience].stop();
                        }
                        
                        //set up new amibence
                        me.ambience = value.track;
                        me.audio[me.ambience].loop = true;
                        
                        //play sound if not muted
                        if (!me.muted) {
                            if (volume) {
                                me.audio[me.ambience].volume = volume;
                            }
                            me.audio[me.ambience].play();
                        }
                    }
                };

                //animate volume changes
                if (value.volume && me.ambience) {
                    var volume = value.volume > 1 ? 1 : (value.volume < 0 ? 0 : value.volume); //greater than 1 is 1. less than 0 is 0
                    $(me.audio[me.ambience]).animate({
                        volume: volume
                    }, 500, function() {
                        trackchange(volume);
                    });
                } else {
                    trackchange(value.volume);
                }
            },
                stopaudio: function(value) {
                if (me.has(me.audio, value)) {
                    var audio = me.audio[value];
                    me.mediaready(audio, function() {
                        audio.stop();
                    });
                }
            },
                playvideo: function(value) {
                var video = document.getElementById(value);
                if (me.isset(video)) {
                    me.mediaready(video, function() {
                        video.play();
                    });
                }
            },
                stopvideo: function(value) {
                var video = document.getElementById(value);
                if (me.isset(video)) {
                    me.mediaready(video, function() {
                        video.stop();
                    });
                }
            },
                timer: function(value) {
                if (me.has(value, 'events') && me.has(value, 'length') && me.has(value, 'id')) {
                    var timer = setTimeout(function() {
                        me.action(value.events);
                        clearTimeout(timer);
                    }, value.length);
                    me.activetimers[value.id] = timer;
                } else {
                    me.console('interval requires properties id, length and events.', 'error');
                }
            },
                stoptimer: function(value) {
                $.each(me.activetimers, function(key, timer) {
                    if (value === key) {
                        clearTimeout(timer);
                    }
                });
            },
                interval: function(value) {
                if (me.has(value, 'events') && me.has(value, 'length') && me.has(value, 'id')) {
                    var interval = setInterval(function() {
                        me.action(value.events);
                    }, value.length);
                    me.activeintervals[value.id] = interval;
                } else {
                    me.console('interval requires properties id, length and events.', 'error');
                }
            },
                stopinterval: function(value) {
                $.each(me.activeintervals, function(key, interval) {
                    if (value === key) {
                        clearInterval(interval);
                    }
                });
            },
                playanimation: function(value) {
                $.each(me.animations, function(index, item){
                    if (item.id === value) {
                        $(item.element).css('background-position','0px 0px');
                        item.currentFrame = 0;
                        var interval = setInterval(function() {
                            item.action(item);
                        }, item.rate);
                        item['interval'] = interval;
                    }
                });
            },
                stopanimation: function(value) {
                $.each(me.animations, function(index, item){
                    if (item.id === value && me.has(item, 'interval')) {
                        clearInterval(item.interval);
                        if (me.has(item, 'ended')) {
                            me.action(item.ended); //actions to call on ended
                        }
                    }
                });
            },
                //used as a conditional. if the current state is one of the values, call action on them
                state: function(value) {

                    var actions = [];
                    for (state in value) {
                        for (statevalue in value[state]) {
                            //if current state value equals this
                            if (statevalue === me.states[state]) {
                                actions.push(value[state][statevalue]);
                            }
                        }                    
                    }

                    //process actions after control loop (i had an issue where I was changing state while looping which triggered the other change state)
                    $.each(actions, function(index, item) {
                    me.action(item); //process as action
                });

                },
                /**
                 * setstate action: used for chaging panel states
                 * @return {[type]}
                 */
                setstate: function(value) {
                //handle each state individually
                $.each(value, function(statename, newvalue){

                    if (newvalue.substring(0,1) === "=") {
                        newvalue = eval(newvalue.substring(1));
                    }

                    //set the change locally
                    me.states[statename] = newvalue;
                    me.storage('states', me.states);
                    //inform the server of state chage
                    var serverstate = {};
                    serverstate[statename] = newvalue;
                    me.touchback(serverstate);
                });
            },
                conditional: function(value) {
                if (me.has(value, 'evaluate') && me.has(value, 'events')) {
                    me.console('conditional result for: ' + value.evaluate + ' is ' + eval(value.evaluate));
                    if (eval(value.evaluate)) {
                        me.action(value.events);
                    }
                } else {
                    me.console('conditional action must have "condition", "evaluate" and "events" as members', 'error');
                }
            },
                custom: function(value) {
                    try {
                        eval(value);
                    } catch(e) {
                        me.console('There was an error in the action "custom":', e, 'error');
                    }
                }
            };
        $.each(object, function(key, value) {
            if (me.defined(value, 'array')) {
                $.each(value, function(index, item) {
                    action[key](me.replacestatevalues(item));
                });
                return;
            }
            action[key](me.replacestatevalues(value));
        });
    },
    /**
     * takes a string and replaces all instances of [=x] with whatever the current value of x is in me.states[x]
     * @param  {String} value
     * @return {String}
     */
    replacestatevalues: function(value) {
        var me = this;
        if (me.defined(value, 'string')) {
            value = value.replace(/\[=(.+)\]/, function(match, p1) {
                return me.states[p1];
            });
        }
        return value;
    },
    //getter for panel
    //callback parameters: (name, panel, source)
    recall: function(panels, callback) {

        var me                  = this,
            loadfromstorage     = [],   //we'll build these lists as we fail to find panels at each check
            loadfromserver      = [];

        //if coming in as singular string or int, convert to array
        panels = me.defined(panels, 'array') ? panels : [panels];

        panels = $.unique(panels); //remove dup entries (can happen from nav.goto)

        //check memory first!
        $.each(panels, function(index, item) {
            if (me.has(me.panels, item) && me.caching) {
                if (me.defined(callback)) {
                    callback(item, me.panels[item], 'memory');
                }
            } else {
                //let's sanitize the list on the first iteration pass. this check cleans up the blank entrys that come in as a result of preloading panels from the nav.goto array
                if (me.isset(item)) {
                    loadfromstorage.push(item);
                }
            }
        });

        //no? check for remaining in local storage next
        $.each(loadfromstorage, function(index, item) {
            var localpanel = me.storage(item);
            if (me.defined(localpanel) && me.caching) {
                //only fire onload when coming from localstorage or server
                if (me.has(localpanel, 'onload')) {
                    me.action(localpanel.onload);
                }
                //cache in memory
                me.panels[item] = localpanel;
                if (me.defined(callback)) {
                    callback(item, localpanel, 'localStorage');
                }
            } else {
                loadfromserver.push(item);
            }
        });

        if (loadfromserver.length > 0) {
            //load panel data from server, takes array, callback called for each panel
            me.load(loadfromserver, function(name, panel, source) {
                //only fire onload when coming from localstorage or server
                if (me.has(panel, 'onload')) {
                    me.action(panel.onload);
                }
                if (me.defined(callback)) {
                    callback(name, panel, source);
                }
            });
        }
    },
    /**
     * touchback is a function which is used to queue up data which will be returned to the server on 
     * 2 different possibilities: 
     * a panel is requested by the server
     * or if timer expires (lots of cached panels mean no panel requests)
     * @return {[type]}
     */
    touchback: function(data) {
        var me = this;
        if ($.isEmptyObject(me.touchbackdata)) {
            //start the countdown timer
            me.touchbacktimer = setTimeout(function() {
                //at end of timer, perform touchback
                me.dotouchback();
                clearTimeout(me.touchbacktimer);
            }, me.touchbacktimerlength);
        }

        //add the data
        $.extend(true, me.touchbackdata, data);
    },
    dotouchback: function() {
        
        states = null;
        try {
            states = JSON.stringify(me.touchbackdata);
        } catch (e) {
            me.console('json stringify failed for touchbackdata:', me.touchbackdata, 'error');
        }

        //call server
        var data = {
            identity: me.identity,
            states: states
        };

        //call server
        me.server('/touchback', data, 'POST', function(response) {
            //did state updates get returned?
            if (me.defined(response, 'object')) {
                $.each(response, function(state, value) {
                    me.states[state] = value;
                });
            }
            me.console('touchback successful');
            //if oncomplete function, run it
            if (me.defined(me.ontouchbackcomplete, "function")) {
                me.ontouchbackcomplete(response);
                me.ontouchbackcomplete = null;
            }
        });

        //reset
        me.touchbackdata = {};
        clearTimeout(me.touchbacktimer); //sometimes we call this function directly, so clear the timeout to be safe
    },
    //quick function for caching panel data in local stroage and mem
    savepanel: function(name, data) {
        this.panels[name] = data;
        this.storage(name, data);
    },
    //retieve panel data from server
    //callback params (name, panel, source)
    load: function(panels, callback) {
        
        var me = this,
            data = {
                panels: panels.join(','),
                identity: me.identity,
                startat: me.startat
            };

        //is touchbak data included
        if (!$.isEmptyObject(me.touchbackdata)) {
            states = null;
            try {
                states = JSON.stringify(me.touchbackdata);
            } catch (e) {
                me.console('json stringify failed for touchbackdata:', me.touchbackdata, 'error');
            }
            //add to post data
            $.extend(data, {
                states: states
            });
            me.touchbackdata = {};
            clearTimeout(me.touchbacktimer);
        }

        var success = function(response) {

            //handle identity
            if (me.has(response, 'identity')) {

                //if the identity coming in is different than the one provided, then the server thought there was a problem with the provided one.
                if (me.identity !== response.identity) {
                    localStorage.clear(); //clear all local cache as we'll build new cache with new ident
                    me.identity = response.identity;
                    me.storage('identity', me.identity);
                    me.console('New identity "' + me.identity + '"', 'log');
                }
            }

            //handle server version
            if (me.has(response, 'version')) {

                //a version mismatch will clear all cache except for identity
                me.handleversion(response.version);
            }

            //when a panel makes use of a state, its necessary to provide the client with a default value. but DONT set the state value if it already exists
            //this value is meant only to provide the client with a default. its possible a touchback call has set this state ready and we dont want to to override it with a default setting :)
            if (me.has(response, 'states')) {
                $.each(response.states, function(state, value) {
                    if (!me.defined(me.states[state])) {
                        me.states[state] = value;
                    }
                });
                me.storage('states', me.states);
            }

            //handle panel data
            if (me.has(response, 'panels')) {
                $.each(response.panels, function(id, panel) {

                    //cache
                    me.savepanel(id, panel);

                    //complete callback passing this panel as a param
                    if (me.defined(callback)) {
                        callback(id, panel, 'server');
                    }
                });
            }
        };

        me.server('/panels', data, 'GET', success);
    },
    /**
     * low level server communication function
     * @param  {string}   url
     * @param  {object}   data
     * @param  {string}   type
     * @param  {Function} onSuccess
     * @return {[type]}
     */
    server: function(url, data, type, onSuccess, onError) {
        $.ajax({
            url: url,
            data: data,
            type: type || 'POST',
            dataType: 'json',
            success: onSuccess,
            error: function(jqXHR, textStatus, errorThrown) {
                me.console(errorThrown, jqXHR, 'error');
            }
        });
    },
    handleversion: function(serverversion) {
        var me = this;
        //we need to validate the server version of myst with the client. if the client differes, we need to expire all cache on the client to retireve "new" content from the server
        if (me.storage('version') !== serverversion) {
            
            me.console('A version mismatch was detected between server and client cache:', {
                server: serverversion,
                client: me.storage('version')
            });

            //clear client caches, local storage and browser memory
            localStorage.clear();
            me.panels = {};
            me.images = {};
            //me.audio = {};    //i'm actualy going to hold off on clearing these caches because we don't want to remove the reference if the client is playing them (ambiance etc). they change infrequently enough anyway
            //me.video = {};
            
            me.storage('identity', me.identity);        //keep our identity
            me.storage('version', serverversion);    //update with new server version
        }
    },
    //defined is a utility function which returns a boolean based on if the var passed in is defined or not. takes optional param which compares typeof. works with "array"
    defined: function(object, type) {
        //returns bool if defined. type optional: returns if defined matches type
        if (typeof type === 'string') { 
            if (type === 'array') {
                if (typeof object === 'object') { //if looking for an array, it must first be an object
                    if (typeof object.length === 'number' && !(object.propertyIsEnumerable('length')) && typeof object.splice === 'function') {
                        return true;
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            } else {
                return (typeof object === type);
            }
        }
        return !(typeof object === 'undefined');
    },
    //returns boolean. has is another utility function which checks if an object map has a member. this is identical to the old me.util.has function
    has: function(object, property) {
        if (this.defined(object, 'object')) {
            if (this.isset(object)) {
                var parts = property.split('.'), i = 0;
                for(i, l = parts.length; i < l; i++) {
                    var part = parts[i];
                    if(object !== null && typeof object === "object" && part in object) {
                        object = object[part];
                    } else {
                        return false;
                    }
                }
                return true;
            }
        }
        return false;
    },
    //isset is a more generic utility function which returns false when undefined, null or is a string, has 0 len
    isset: function(value) {
        if (typeof value === 'undefined') {
            return false;
        }
        if (value == null) {
            return false;
        }
        if (typeof value === 'string') {
            if (value.length === 0) {
                return false;
            }
        }
        return true;
    },
    //console is our custom method handling me.console accross browsers and env's
    console: function(message, object, level) {
        var me = this;
        
        if (window.console) {
        
            //because object and level are both optional params, its possible for level to come in as object
            level = me.defined(object, 'string') ? object : me.defined(level) ? level : 'log';
            
            //add timestamp to message
            var diff = (new Date().getTime() - this.sessiontime), minutes = parseInt(diff / 1000 / 60, 10), seconds = parseInt((diff / 1000) - (minutes * 60), 10), mil = parseInt(diff - (seconds * 1000) - (minutes * 60000), 10);
            message = minutes + ':' + seconds + ':' + mil + ' ' + message;
        
            
            if (this.defined(object, 'object')) {
                console[level](message, object);
            } else {
                console[level](message);
            }
        }
    },
    /*
    jsonizeurlparameters: returns a json object of key:value pairs that represent the current url parameters passed to the page
    */
    jsonizeurlparameters: function() {
        var response = {};
        var e,
            a = /\+/g,  // Regex for replacing addition symbol with a space
            r = /([^&=]+)=?([^&]*)/g,
            d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
            q = window.location.search.substring(1);
    
        while (e = r.exec(q)) {
            response[d(e[1])] = d(e[2]);
        }
        return response;
    },
    videoerror: function(e) {
        var me = this;
        // video playback failed - show a message saying why
        switch (e.target.error.code) {
            case e.target.error.MEDIA_ERR_ABORTED:
                me.console('You aborted the video playback.', 'error');
                break;
            case e.target.error.MEDIA_ERR_NETWORK:
                me.console('A network error caused the video download to fail part-way.', 'error');
                break;
            case e.target.error.MEDIA_ERR_DECODE:
                me.console('The video playback was aborted due to a corruption problem or because the video used features your browser did not support.','error');
                break;
            case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                me.console('The video could not be loaded, either because the server or network failed or because the format is not supported.','error');
                break;
            default:
                me.console('An unknown error occurred.','error');
                break;
        }
    },
    mediaready: function(element, callback, maxtries) {
        var tries = 0, maxtries = maxtries || 10000, isready = function() {
            if (element.readyState === 4) {
                callback(element);
            } else if (tries < maxtries) {
                setTimeout(function() {
                    isready();
                }, 1);
                ++tries;
            } else {
                console.log('Attempted to perform an operation on the media: "' + element + '" but it was never ready.', 'error');
            }
        };
        isready();
    },
    storage: function(key, value) {
        
        var me      = this,
            result  = undefined; //default return value undef

        //if value is defined, we have a set, otherwise a get
        if (me.defined(value)) {
            try {
                result = localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                me.console('There was an error in setting localStorage', e, 'error');
            }
        } else {
            try {
                if (me.isset(localStorage.getItem(key))) {
                    result = JSON.parse(localStorage.getItem(key));
                }
            } catch (e) {
                me.console('There was an error in getting localStorage', e, 'error');
            }
        }
        return result;
    },
    /**
     * loads all panels out of local storage. at the moment I'm only parsing json as a qualifier. 
     * this function is important when I need to modify a panel (like state) before it exists in memory
     * @return {[type]} [description]
     */
    loadallpanelsfromstorage: function() {
        var me = this,
            collection = {};

        $.each(localStorage, function(key, value) {
            try {
                var result = JSON.parse(value);
                if (me.defined(result, 'object')) {
                    var object = {};
                    object[key] = result;
                    $.extend(true, collection, object);
                }
            } catch (e) {
            }
        });
        return collection;
    },
    buildcontrols: function() {

        var me = this;

        
        $('#panelwrapper')
            .mouseleave(function(e) {
                $('#controls-top').fadeTo(100, 1);
            })
            .mouseenter(function(e) {
                $('#controls-top').fadeTo(500, 0);
            });

        $('#mute').click(function(e) {
            me.mute(!$(this).hasClass('muted'));
        });

        $('#zip').click(function(e) {
            me.zipmode();
        });
        $('#zoom').click(function(e) {
            me.zoom();
        });
        $('#travel').click(function(e) {
            me.transition();
        });

        $('#guard').click(function(e) {
            e.stopPropagation();
        });
    },
    mute: function(on) {
        var me = this;
        on = !me.defined(on) ?!me.muted : on; //if undef, toggle me.muted
        me.muted = on;
        me.storage('mute', on);
        on ? $('#mute').addClass('muted') : $('#mute').removeClass('muted');
        if (me.isset(me.ambience)) {
            on ? me.audio[me.ambience].stop() : me.audio[me.ambience].play();
        }
        $.each(me.video, function(index, item) {
            this.muted = on;
        });
        $.each(me.audio, function(index, item) {
            this.muted = on;
        });
    },
    zipmode: function(bool) {
        var me = this;
        if (bool !== undefined) {
            me.zip = bool;
        } else {
            me.zip = !me.zip;
        }
        me.storage('zipmode', me.zip);
        $('#zip span').text(me.zip ? 'on' : 'off');
    },
    zoom: function(factor) {
        var me = this;
        var oldclass = 'zoom' + me.zoomfactor;
        me.zoomfactor = factor || me.zoomfactor + 1;                //set zoom if specified, otherwise increase property
        me.zoomfactor = me.zoomfactor > 3 ? 1 : me.zoomfactor;      //3 is limit
        $('#screen').removeClass(oldclass).addClass('zoom' + me.zoomfactor);
        me.storage('zoom', me.zoomfactor);
        $('#zoom span').text(me.zoomfactor + 'x');
    },
    transition: function(type) {
        var me = this;
        if (type) {
            me.transitiontype = type;
        } else {
            me.transitiontype = (me.transitiontype === 'modern' ? 'classic' : 'modern');
        }
        me.storage('transition', me.transitiontype);
        $('#travel span').text(me.transitiontype);
    }
};
myst.initialize(mystserver); //be sure mystserver value is defined in dom (generally from jade template)
