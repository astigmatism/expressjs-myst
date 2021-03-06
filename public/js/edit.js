var edit = {
        
    editor: null,
    activepanel: null,
    activetype: null,
    assets: null,

    uploadbg: null,
    audioplayer: null,

    previewmute: false,

    navigation: null, //for modifications to navigation with the dialog, mixed in on ok thrown away on cancel

    initialize: function() {
        var me = this;

        me.buildcontrols();
        
        // if (me.isset(me.storage('editpanel'))) {
        //     me.open(me.storage('editpanel'),);
        // }

        me.audioplayer = new Audio();
        me.audioplayer.stop = function() {
            this.pause();
            this.currentTime = 0;
        };

    },
    //open this panel in the editor
    open: function(id, type) {
        var me = this;

        $('#panelassets').empty();

        $.getJSON('/edit/load?panel=' + id + '&type=' + type, function(response) { 

            me.activepanel = id;
            me.activetype = type;

            me.editor.set(response.content);
            me.assets = response.assets;

            $.each(me.assets, function(index, item) {
                $('#panelassets').append('<li option="' + index + '"><img src="' + item.path + '" /></li>');
            });
            $('#panelassets').selectable();

            me.storage('editpanel', me.activepanel);
            $('#panelname').text(id);
            me.preview();
            
            if (response.content.notes.id) {
                $('#source').attr('src', 'http://localhost:3000/edit/source?id=' + response.content.notes.id);
            }
        });
    },
    save: function() {
        var me = this;
        if(me.isset(me.activepanel)) {

            var json = JSON.stringify(me.editor.get());
            $.post('/edit/save', {
                panel: me.activepanel,
                data: json,
                type: me.activetype
            }, function(response) {
                me.preview(); 
            });

        } else {
            alert('no active panel');
        }
    },
    newpanel: function() {
        var me = this;
        $.getJSON('/edit/new', function(response) { 
            me.open(response, 'panels');
            $('#panelpicker').hide();
        });
    },
    deletepanel: function() {
        var me = this;
        if (me.activetype === 'panels') {
            if (confirm('Are you sure you want to delete panel ' + me.activepanel + ' from the system entirely?')) {
                if (confirm('Are you REALLY sure? This process is not reversable')) {
                    $.post('/edit/delete', {
                        panel: me.activepanel
                    }, function() {
                        me.open(0, 'panels');
                    });
                }
            }
        }
        else {
            alert('You cannot delete this file type.');
        }
    },
    preview: function(id) {
        var me = this;
        localStorage.clear(); //clear cache on each refresh
        document.getElementById('preview').src = '/?devmode=true&startat=' + (id || me.activepanel);
    },
    buildpanelpicker: function(callback) {
        $('#panelpicker .panels').empty();
        $.ajax({
            url: '/edit/panels'
        }).done(function(response) {

            response.sort(function(a,b){
                return b.name - a.name;
            });

            $.each(response, function(key, value) {
                if (value.image == null) {
                    $('#panelpicker .panels').append('<div class="screen nobg"><div class="name">' + value.name + '</div></div>');
                } else {
                    $('#panelpicker .panels').append('<div class="screen"><div class="name">' + value.name + '</div><image src="' + value.image + '" height="86" width="136"></image></div>');
                }
            });
            $('#panelpicker .panels div').on('click', function() {
                callback(parseInt($(this).find('div.name').text(), 10), 'panels');
                $('#panelpicker').hide();
            });

        }); 
        $('#panelpicker').show();
    },
    buildzippicker: function(callback) {
        var me = this;
        $('#panelpicker .panels').empty();
        $.ajax({
            url: '/edit/zips'
        }).done(function(response) {

            $.each(response.content, function(key, value) {

                var item = $('<div class="screen"><div class="name">' + key + '</div><image src="/assets/' + me.panelImage(value.goto) + '/bg.jpg" height="86" width="136"></image></div>').on('click', {
                    name: key,
                    details: value
                }, function(event) {
                    callback(event.data);
                    $('#panelpicker').hide();
                    $('button.new').show();
                });
                $('#panelpicker .panels').append(item);
            });
        });
        $('button.new').hide();
        $('#panelpicker').show();
    },
    buildaudiopicker: function(callback) {
        var me = this;
        $('#audiomenu').empty();
        $('#audiopicker .use').unbind();
        $.ajax({
            url: '/edit/audio'
        }).done(function(response) {

            $.each(response, function(index, item) {
                $('#audiomenu').append('<li option="' + item + '">' + item + '</li>');
            });
            $('#audiomenu').selectable({
                selected: function( event, ui ) {
                    var selected = ui.selected.attributes.option.value;
                    me.audioplayer.src = "/assets/audio/" + selected + "/" + selected + ".mp3";
                    me.audioplayer.play();
                }

            });

            //bnd event to use to callback with track
            $('#audiopicker .use').on('click', function() {
                var selected = $('#audiomenu li.ui-selected').attr('option');
                callback(selected);
                $('#audiopicker .cancel').trigger('click');
            });
        });
        $('#audiopicker').show();
    },
    buildcontrols: function() {
        var me = this;
        $(document).ready(function() {

            me.editor = new jsoneditor.JSONEditor(document.getElementById("editor"), {
                mode: 'code',
                indentation: 4
            });
            //trap save
            document.addEventListener("keydown", function(e) {
              if (e.keyCode == 83 && (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)) {
                e.preventDefault();
                me.save();
              }
            }, false);

            //open
            $('.commands .open').button({ 
                icons: { 
                    primary: 'ui-icon-folder-open' 
                }
            }).click(function() {
                me.buildpanelpicker(function(id, type) {
                    me.open(id, type);
                });
            });

            //save
            $('.commands .save').button({ 
                icons: { 
                    primary: 'ui-icon-disk' 
                }
            }).click(function() {
                me.save();
            });

            //zip mode
            $('.commands .zips').button({ 
                icons: { 
                    primary: 'ui-icon-extlink' 
                }
            }).click(function() {
                me.open('zips', 'zips'); 
            });
            
            //states
            $('.commands .states').button({ 
                icons: { 
                    primary: 'ui-icon-document' 
                }
            }).click(function() {
                me.open('states', 'states'); 
            });

            //delete
            $('.commands .delete').button({ 
                icons: { 
                    primary: 'ui-icon-closethick' 
                }
            }).click(function() {
                me.deletepanel();
            });

            //preview
            $('.commands .preview').button({ 
                icons: { 
                    primary: 'ui-icon-refresh' 
                }
            }).click(function() {
                me.preview();
            });

            //preview
            $('.commands .mute').button({ 
                icons: { 
                    primary: 'ui-icon-volume-off' 
                }
            }).click(function() {
                me.previewmute = !me.previewmute;
                if (document.getElementById('preview').contentWindow) {
                    document.getElementById('preview').contentWindow.myst.mute(me.previewmute);
                }
                if (me.previewmute) {
                    $(this).find('span.ui-button-icon-primary').removeClass('ui-icon-volume-off').addClass('ui-icon-volume-on');
                    $(this).find('span.ui-button-text').text('Unmute');
                } else {
                    $(this).find('span.ui-button-icon-primary').removeClass('ui-icon-volume-on').addClass('ui-icon-volume-off');
                    $(this).find('span.ui-button-text').text('Mute');
                }
            });   

            //clear local storgae
            $('.commands .clearls').button({ 
                icons: { 
                    primary: 'ui-icon-refresh' 
                }
            }).click(function() {
                localStorage.clear();
            });
            
 
            //cancel panel picker
            $('#panelpicker .cancel').button({ 
                icons: { 
                    primary: 'ui-icon-close'
                }
            }).click(function() {
                $('#panelpicker').hide();
            });

            //new panel
            $('#panelpicker .new').button({ 
                icons: { 
                    primary: 'ui-icon-star'
                }
            }).click(function() {
                me.newpanel();
            });

            //setup nav
            $('button.navigation').button({ 
                icons: { 
                    primary: 'ui-icon-newwin'
                }
            }).click(function() {
                $('#navigationdialog').dialog('open');
            });

            //insert div
            $('#toolbar button.div').button({ 
                icons: { 
                    primary: 'ui-icon-arrowreturnthick-1-w' 
                }
            }).click(function() {
                
                var inserted = [{
                    tag: 'div',
                    attr: {},
                    css: {
                        top: '166px',
                        left: '272px',
                        width: '100px',
                        height: '100px',
                        'z-index':101
                    },
                    events: {}
                }];

                //need to maintain content and preloaded images
                var json = me.editor.get();
                if (me.has(json, 'content')) {
                    content = $.merge(inserted, json['content']);
                }

                me._addtoeditor({
                    'content': content
                }, true);
            });

            //audiopicker
            $('#toolbar button.audiopicker').button({ 
                icons: { 
                    primary: 'ui-icon-newwin'
                }
            }).click(function() {
                me.buildaudiopicker(function(track) {
                    var audio = [track],
                    json = me.editor.get(); //need to maintain preload audio array

                    if (me.has(json, 'onload.preload.audio')) {
                        audio = $.merge(audio, json.onload.preload.audio);
                        $.unique(audio); //remove dupes
                    }

                    me._addtoeditor({
                        'onload': {
                            'preload': {
                                'audio': audio
                            }
                        }
                    });
                });
            });

            //cancel audio picker
            $('#audiopicker .cancel').button({ 
                icons: { 
                    primary: 'ui-icon-close'
                }
            }).click(function() {
                $('#audiopicker').hide();
                me.audioplayer.stop();
            });
            //stop audio
            $('#audiopicker .stop').button({ 
                icons: { 
                    primary: 'ui-icon-stop'
                }
            }).click(function() {
                me.audioplayer.stop();
            });

            //use (style only), event with buildaudiopicker
            $('#audiopicker .use').button({ 
                icons: { 
                    primary: 'ui-icon-check'
                }
            });

            //nav dialog
            $( "#navigationdialog" ).dialog({ 
                autoOpen: false,
                buttons: [ 
                    { 
                        text: "Cancel", 
                        click: function() { 
                            $(this).dialog('close'); 
                        } 
                    },
                    { 
                        text: "Save", 
                        click: function() {

                            var navigation = [];

                            //construct the json from the ui
                            $.each($('#navigationdialog ul.hotspots').children(), function(index, item) {
                                var hotspot = {
                                    'width': $(this).find('.width').val(),
                                    'height': $(this).find('.height').val(),
                                };
                                if ($(this).find('.top').val().length > 0) {
                                    hotspot.top = $(this).find('.top').val();
                                }
                                if ($(this).find('.left').val().length > 0) {
                                    hotspot.left = $(this).find('.left').val();
                                }
                                if ($(this).find('.bottom').val().length > 0) {
                                    hotspot.bottom = $(this).find('.bottom').val();
                                }
                                if ($(this).find('.right').val().length > 0) {
                                    hotspot.right = $(this).find('.right').val();
                                }
                                if ($(this).find('.goesto').val().length > 0) {
                                    hotspot.goto = $(this).find('.goesto').val();
                                }

                                //if a zip node
                                if ($(this).find('.forzip').text().length > 0) {
                                    hotspot.zipcode = $(this).find('.forzip').text();
                                }
                                //if not a zip, then these details are imporant
                                else {
                                    if (($('#navigationdialog .panel .hotspot' + (index + 1)).find('.cursor').attr('name')).length > 0) {
                                        hotspot.cursor = $('#navigationdialog .panel .hotspot' + (index + 1)).find('.cursor').attr('name');
                                    }
                                    if ($(this).find('.track').val().length > 0) {
                                        hotspot.ambience = $(this).find('.track').val();
                                    }
                                    if ($(this).find('.volume').val().length > 0) {
                                        hotspot.volume = $(this).find('.volume').val();
                                    }
                                }

                                navigation.push(hotspot);
                            });

                            me._addtoeditor({ 'navigation': navigation }, true);

                            $(this).dialog('close'); 
                        } 
                    }
                ],
                modal: false,
                minHeight: 800,
                minWidth: 700,
                position: { 
                    my: "center", 
                    at: "top", 
                    of: $('#editor') },
                open: function(event, ui) {
                    //set dialog components with data from this panel by default
                    $('#navigationdialog .panel').css('background-image','url(/assets/' + me.activepanel + '/bg.jpg)');

                    var json = me.editor.get();

                    if (me.has(json, 'navigation')) {
                        $.each(json.navigation, function(index, item) {
                            $('#navigationdialog .add').trigger('click', item);
                        });
                    }
                },
                close: function( event, ui ) {
                    //clean up
                    $('#navigationdialog ul.hotspots').empty();
                    $('#navigationdialog .panel').empty();

                    $('#navigationdialog .controls').hide();
                }
            });

            //nav add
            $('#navigationdialog .add').button({ 
                icons: { 
                    primary: 'ui-icon-plus'
                }
            }).click(function(e, json) {

                json = json || {};

                var child = $('#navigationdialog ul.hotspots').children().length + 1;
                var listme = '#navigationdialog li.hotspot' + child;
                $('#navigationdialog ul.hotspots').append(
                    '<li class="hotspot hotspot' + child + '">' +
                    '<div class="sectionleft">' + 
                    '<div class="screen"><div class="name"></div><img class="panelprev" src="" height="66" width="108" /></div>' + 
                    '</div>' + 
                    '<div class="sectionright">' + 
                    '<button class="picker">Goto</button>' +
                    '<button class="zip">Zip</button>' +
                    ' <input hidden="true" type="text" class="goesto" value="" />' + //the TRUE name of the goto including @ or state values
                    ' <input hidden="true" type="text" class="zipcode" value="" />' +
                    ' W: <input class="width" value="' + (json.width || '') + '" />' +
                    ' H: <input class="height" value="' + (json.height || '') + '" />' +
                    ' L: <input class="left" value="' + (json.left || '') + '" />' +
                    ' B: <input class="bottom" value="' + (json.bottom || '') + '" />' +
                    ' R: <input class="right" value="' + (json.right || '') + '" />' +
                    ' T: <input class="top" value="' + (json.top || '') + '" />' +
                    '<div class="forzip"></div>' + 
                    ' <div class="nonzip"><button class="audiopicker">Ambiance</button>' +
                    ' <input class="track" style="width:250px" value="' + (json.ambience || '') + '" />' +
                    ' Vol: <input class="volume" value="' + (json.volume || '') + '" />' + 
                    '<ul class="cursors">' +
                        '<li option="">X</a></li>' +
                        '<li option="up"><img src="/assets/cursors/up.png" /></li>' +
                        '<li option="down"><img src="/assets/cursors/down.png" /></li>' +
                        '<li option="left"><img src="/assets/cursors/left.png" /></li>' +
                        '<li option="right"><img src="/assets/cursors/right.png" /></li>' +
                        '<li option="open"><img src="/assets/cursors/open.png" /></li>' +
                        '<li option="zip"><img src="/assets/cursors/zip.png" /></li>' +
                    '</ul>' +
                    '</div>' + 
                    ' <button class="remove" style="float:right">Remove</button>' +
                    '<div style="clear:both"></div>' +
                    '</div>' + 
                    '</li>'
                );

                //nav pabel picker
                $(listme + ' .picker').button({ 
                    icons: { 
                        primary: 'ui-icon-star'
                    }
                }).click(function() {
                    me.buildpanelpicker(function(panel) {
                        $(listme + ' .goesto').val('@' + panel).trigger('change');
                    });
                });

                //zip panel picker
                $(listme + ' .zip').button({ 
                    icons: { 
                        primary: 'ui-icon-star'
                    }
                }).click(function() {
                    me.buildzippicker(function(zipdata) {
                        $(listme + ' .zipcode').val(zipdata.name).trigger('change', {
                            name: zipdata.name,
                            goto: zipdata.details.goto
                        });
                    });
                });

                //remove this
                $(listme + ' .remove').button({ 
                    icons: { 
                        primary: ' ui-icon-close'
                    }
                }).click(function() {
                    $(listme).remove();
                    $('#navigationdialog .panel .hotspot' + child).remove();

                });

                //ambiance button
                $(listme + ' .audiopicker').button({ 
                    icons: { 
                        primary: 'ui-icon-newwin'
                    }
                }).click(function(e) {
                    me.buildaudiopicker(function(track) {
                        $(listme + ' .track').val(track);
                    });
                });

                //panel oerlay
                $('#navigationdialog .panel').append(
                    '<div class="overlay hotspot' + child + '">' +
                        '<div class="cursor" name=""></div>' +
                        '<div class="goes"></div>' +
                    '</div>'
                );
                
                //listeners
                $(listme + ' input').keyup(function(e) { 
                    $('#navigationdialog .panel .hotspot' + child).css($(e.target).attr('class'),(this.value !== "" ? this.value + 'px' : '')); 
                });

                //goes to
                $(listme + ' .goesto').change(function() {
                    $(listme + ' .forzip').empty().hide();
                    $(listme + ' .nonzip').show();
                    
                    $('#navigationdialog .panel .hotspot' + child).find('.goes').text(me.panelImage(this.value)); //label in preview
                    $('#navigationdialog .panel .hotspot' + child).find('.cursor').empty();

                    $(listme + ' img.panelprev').attr('src', '/assets/' + me.panelImage(this.value) + '/bg.jpg');
                    $(listme + ' .screen .name').text(me.panelImage(this.value));
                });

                //zipcode
                $(listme + ' .zipcode').change(function(event, zipdata) {
                    $(listme + ' .nonzip').hide();
                    $(listme + ' .forzip').show().text(zipdata.name);
                    $(listme + ' .goesto').val(zipdata.goto);
                    
                    $(listme + ' img.panelprev').attr('src', '/assets/' + me.panelImage(zipdata.goto) + '/bg.jpg');
                    $(listme + ' .screen .name').text(zipdata.name);

                    $('#navigationdialog .panel .hotspot' + child).find('.goes').text(zipdata.name); //label in preview
                    $('#navigationdialog .panel .hotspot' + child).find('.cursor').empty().append('<img src="/assets/cursors/zip.png" />');
                });

                //selectable

                $(listme + ' .cursors').selectable({
                    selected: function( event, ui ) {
                        var selected = ui.selected.attributes.option.value;

                        $('#navigationdialog .panel .hotspot' + child).find('.cursor').attr('name', selected);
                        $('#navigationdialog .panel .hotspot' + child).find('.cursor').empty().append('<img src="/assets/cursors/' + selected + '.png" />');
                    }

                });

                //defaults
                
                if (json.zipcode) {
                    $(listme + ' .zipcode').trigger('change', {
                        name: json.zipcode, 
                        goto: json.goto
                    });   
                }
                //not a zip
                else {
                    if (json.goto) {
                        $(listme + ' .goesto').val(json.goto).trigger('change');
                    }
                    $.each($(listme + ' .cursors').selectable().children(), function(index, item) {
                        if ($(item).attr('option') === json.cursor) {
                            $(item).addClass('ui-selected');
                            $('#navigationdialog .panel .hotspot' + child).find('.cursor').attr('name', json.cursor);
                            $('#navigationdialog .panel .hotspot' + child).find('.cursor').empty().append('<img src="/assets/cursors/' + json.cursor + '.png" />');
                        }
                    });
                }
                
                $('#navigationdialog .panel .hotspot' + child).css({
                    width: json.width,
                    height: json.height
                });
                if (json.top) {
                    $('#navigationdialog .panel .hotspot' + child).css('top', json.top + 'px');
                }
                if (json.left) {
                    $('#navigationdialog .panel .hotspot' + child).css('left', json.left + 'px');
                }
                if (json.bottom) {
                    $('#navigationdialog .panel .hotspot' + child).css('bottom', json.bottom + 'px');
                }
                if (json.right) {
                    $('#navigationdialog .panel .hotspot' + child).css('right', json.right + 'px');
                }
            });

        
            
            //background upload
            $('#uploadbg').fileupload({
                dataType: 'json',
                add: function (e, data) {
                    data.context = 
                        $('<button>Upload</button>').button({
                            icons: { 
                                primary: 'ui-icon-arrow-1-ne'
                            }
                        })
                        .appendTo($('#uploadbg').parent())
                        .click(function () {
                            $('#uploadbg').fileupload({
                                url: '/edit/assetupload?type=bg&panel=' + me.activepanel
                            });
                            data.context = $('<span/>').text('Uploading').replaceAll($(this));
                            data.submit();
                        });
                },
                done: function (e, data) {
                    data.context.remove();

                    //need to maintain preload images array
                    var json = me.editor.get(),
                        images = [me.activepanel + '/bg.jpg'];

                    if (me.has(json, 'onload.preload.images')) {
                        images = $.merge(images, json.onload.preload.images);
                        $.unique(images); //remove dupes
                    }

                    me._addtoeditor({
                        'onload': {
                            'preload': {
                                'images': images
                            }
                        },
                        'background': me.activepanel + '/bg.jpg'
                    });
                }
            });

            //asset upload
            $('#uploadasset').fileupload({
                dataType: 'json',
                add: function (e, data) {
                    data.context = 
                        $('<button>Upload</button>').button({
                            icons: { 
                                primary: 'ui-icon-arrow-1-ne'
                            }
                        })
                        .appendTo($('#uploadasset').parent())
                        .click(function () {
                            $('#uploadasset').fileupload({
                                url: '/edit/assetupload?type=asset&panel=' + me.activepanel
                            });
                            data.context = $('<span/>').text('Uploading').replaceAll($(this));
                            data.submit();
                        });
                },
                done: function (e, data) {
                    data.context.remove();
                    me.open(me.activepanel, me.activetype);
                }
            });

            //insert asset
            $('#toolbar .assets button.insert').button({
                icons: { 
                    primary: 'ui-icon-arrowreturnthick-1-w'
                }
            }).click(function() {
                selected = parseInt($('#panelassets li.ui-selected').attr('option')); //index into me.assets array

                var images = [(me.assets[selected].path).replace('/assets/','')];

                var image = new Image();
                image.src = me.assets[selected].path;

                var inserted = [{
                    tag: 'div',
                    attr: {},
                    css: {
                        width: image.width + 'px',
                        height: image.height + 'px',
                        left: '272px',
                        bottom: '166px',
                        'background-image': 'url(\'' + me.assets[selected].path + '\')'
                    },
                    events: {}
                }];

                //need to maintain content and preloaded images
                var json = me.editor.get();
                if (me.has(json, 'content')) {
                    content = $.merge(inserted, json['content']);
                }
                if (me.has(json, 'onload.preload.images')) {
                        images = $.merge(images, json.onload.preload.images);
                        $.unique(images); //remove dupes
                    }

                me._addtoeditor({
                    'onload': {
                        'preload': {
                            'images': images
                        }
                    }
                });
                me._addtoeditor({
                    'content': content
                }, true);

            });

            //delete asset
            $('#toolbar .assets button.delete').button({ 
                icons: { 
                    primary: 'ui-icon-closethick'
                }
            }).click(function() {
                selected = parseInt($('#panelassets li.ui-selected').attr('option')); //index into me.assets array
                $.post('/edit/deleteasset', {
                    panel: me.activepanel,
                    file: me.assets[selected].name
                }, function() {

                    var json = me.editor.get(),
                        images = [];
                    if (me.has(json, 'onload.preload.images')) {
                        images = $.grep(json.onload.preload.images, function(value) {
                          return value != me.assets[selected].name;
                        });
                    }
                    if (images.length > 0) {
                        me._addtoeditor({
                            'onload': {
                                'preload': {
                                    'images': images
                                }
                            }
                        });
                    }
                    me.open(me.activepanel, me.activetype);
                });
            });

            //events to trap local storage state changes
            var handle_storage = function(e) {
                var states = {};
                try {
                    states = JSON.parse(localStorage.states); //parse out preview states
                } catch (e) {
                }
                $('#statelist').empty();
                for (state in states) {
                    $('#statelist').append('<li>' + state + ': ' + states[state] + '</li>');
                }
            };
            if (window.addEventListener) {
              window.addEventListener("storage", handle_storage, false);
            } else {
              window.attachEvent("onstorage", handle_storage);
            };

        });
    },
    _addtoeditor: function(newjson, shallow) {
        var me = this,
            shallow = shallow || false,
            json = me.editor.get();
            if (shallow) {
                $.extend(json, newjson);
            } else {
                $.extend(true, json, newjson);
            }
            
            me.editor.set(json);
            me.save();
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
    panelImage: function(value) {
        if (value) {
            if (value.slice(0,2) === "[=" && value.slice(-1) === "]") {
                return value; //do nothing for now
            } 
            return value.replace(/\D/g,'');
        }
        return '';
    }
};
edit.initialize();