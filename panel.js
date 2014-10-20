/**
 * Panel Model
 */

var data = require('./data.js');
var security = require('./security.js');
var traverse = require('traverse');
var type = require('type-of-is');
var fs = require('fs');
var async = require('async');
var statemanager = require('./states.js');

exports.get = function(panelid, callback, cachelength) {

    cachelength = cachelength || -1; //-1 says to avoid getting or setting the cache. 0 is never expire

	data.getFile(panelid, 'panels', function(content) {
		callback(content);
	}, cachelength);
};

exports.save = function(panelid, content, callback, cachelength) {

    cachelength = cachelength || -1; //-1 says to avoid getting or setting the cache. 0 is never expire

    data.setFile(panelid, 'panels', content, cachelength);
};

exports.setPanelStates = function (content, identity, callback) {
    
    var statesused = {};

    statemanager.getStates(identity, function(states) {

        //traverse the json tree
        traverse(content).forEach(function (value) {

            //if the current key is "state"
            if (this.key === 'state') {

                var newstate = {}; //we'll add this to this node once modified

                for (state in this.node) {

                    if (states[state]) {

                        var statedata = this.node[state];

                        //an important distinction is made here: there are two possibilities for how state is understood
                        //1) if state is an object, the members of the object are possible state outcomes with actions. The client will decide which to act upon based on the state value
                        if (type.is(statedata, Object)) {

                            //add to the states used. we need to supply the value for this state to the client so that it can act on a condition
                            statesused[state] = '';
                            
                            var conditions = {};

                            //for each state condition, 
                            for (statecondition in statedata) {

                                //the condition values might be encryped but their values are not, they are used in the client as actions
                                var condition = (states[state].encrypt) ? security.serverencrypt(statecondition, identity) : statecondition;

                                conditions[condition] = statedata[statecondition];
                            }
                            newstate[security.serverencrypt(state, identity)] = conditions;

                        }
                        //2) if state is a string, then this means the state in the client is being set to that value within the event specified
                        else if (type.is(statedata, String)) {

                            console.log(state);

                            //does the client value need to appear encryped?
                            var clientstatevalue = states[state].encrypt ? security.serverencrypt(statedata, identity) : statedata;

                            newstate[security.serverencrypt(state, identity)] = clientstatevalue;
                        }
                    } 
                    else {
                        console.error('ERROR: setPanelStates. cannot find state data for state name: ' + state);  
                    }
                }

                this.update(newstate);
            }

            //if a leaf node, a string, and the string matches
            if (this.isLeaf && type.is(value, String)) {
                
                //regex for "direct value" words e.g. [=statename]
                var regex = /\[=(\w+)\]/g;
                
                //encrypt direct value state names
                var newvalue = value.replace(/\[=(\w+)\]/g, function(match, p1) {
                    statesused[p1] = ''; //save as property to states used object
                    return '[=' + security.serverencrypt(p1, identity) + ']'; //return value encrypted
                });

                this.update(newvalue); //update value in tree
            }
        });
        
        //loop through all states used by this panel which we need to inform the client about
        for (statename in statesused) {
            //if found in our states set
            if (states[statename]) {

                //does the client value need to appear encryped? get value from game states (merged default and user)
                var clientstatevalue = states[statename].encrypt ? security.serverencrypt(states[statename].value, identity) : states[statename].value;

                statesused[statename] = clientstatevalue;
            }
        }

        callback(content, statesused);
    });
};

/**
 * Tranvse Json tree for panel and replace any leaf nodes with panel id's in them. encry using the server indent for this user
 * @param  {Object} panel
 * @param  {String} serverIdent
 * @return {undef}
 */
exports.encryptPanelNames = function(panel, identity) {
    
    //traverse the json tree
    traverse(panel).forEach(function (value) {

        //if a leaf node, a string, and the string matches
        if (this.isLeaf && type.is(value, String) && value.match(/^@(\d+)$/)) {
            
            var panelid = value.slice(1); //extract out the actual panel id. based on our match routine, simply drop the @ char

            var encrypted = security.serverencrypt(panelid, identity); //encrypt id

            this.update(encrypted); //update value in tree
        }
    });
};

exports.getAssets = function(panelid, callback) {

    var assets = [];
    fs.readdir(__dirname + '/public/assets/' + panelid, function (err, list) {

        if (err) {
            console.error('ERROR: File system readdir: ' + __dirname + '/public/assets/' + panelid, err);
            callback(assets);
            return;
        }

        if (type.is(list, Array) && list.length > 0) {
            async.eachSeries(list, function(file, cb) {

                assets.push({
                    name: file, //file name with file ext is needed
                    path: '/assets/' + panelid + '/' + file
                });

                cb(); // next item in series
            },
            // Final callback after each item has been iterated over.
            function() {
                callback(assets);
            });
            return;
        }
        callback(assets);
    });
};

