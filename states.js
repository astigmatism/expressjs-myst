/**
 * States Model
 */
var data = require('./data.js');
var security = require('./security.js');
var traverse = require('traverse');
var type = require('type-of-is');
var async = require('async');

/**
 * this call is handled by both touchback and panels controllers so include the param checks in here as well
 * @param  {[type]}   identity [description]
 * @param  {[type]}   states   [description]
 * @param  {Function} callback [description]
 * @return {Object}            an object of state:value to update the client with
 */
exports.clientStatesChanged = function(identity, states, callback) {

	//without any state data don't even bother
	if (!states) {
		callback({});
		return;
	}

	//comes in as stringified json object called "states"
	try {
		states = JSON.parse(states);
	} catch (e) {
		console.error('ERROR. touchback could not parse state POST param:', e);
	}

	if (!type.is(states, Object) || !identity) {
		console.error('ERROR: touchback error with states or identity:', {
			states: states,
			identity: identity
		});
		callback({});
		return;
	}

	//prep response object
	var updatedstates = {};

	//for each state passed in as changed
    async.eachSeries(Object.keys(states), function(encryptedstatename, next) {

    	var statename = security.serverdecrypt(encryptedstatename, identity); //statename will always come in encrypted		

    	//user's trying to spoof state names will likely fail the decryption (returns null), let's stop them here
    	if (statename) {
	    	isStateValueEncrypted(statename, function(isencrypted) {

	    		//how should we handle the incoming state value? was it encrypted in the client?
	    		var value = states[encryptedstatename]; //incoming states object still uses encrypted state names remember!
	    		if (isencrypted) {
	    			value = security.serverdecrypt(value, identity);
	    		}

	    		//set the state for this user (identity).
	    		setState(identity, statename, value, function(updates) {

		    		if (type.is(updates, Object)) {
		    			for (state in updates) {
		    				updatedstates[state] = updates[state]; //append to response
		    			}
		    		}

		    		next(); // next item in series
		    	});

	    	});
	    } else {
	    	next(); //state name failed decryption, skip to next
	    }
    }, 
    // Final callback after each item has been iterated over.
    function() {

    	//we have to prepare this response for the client as well now however which means encrypting state names and possibly their values
		var response = {};

		//for each updated state to inform client about
		async.eachSeries(Object.keys(updatedstates), function(updatedstate, cb) { 	
	    	
	    	//find out if we encrypt the value
	    	isStateValueEncrypted(updatedstate, function(isencrypted) {

	    		var encryptedstatename = security.serverencrypt(updatedstate, identity);
	    		var statevalue = isencrypted ? security.serverencrypt(updatedstates[updatedstate], identity) : updatedstates[updatedstate];
	    		
	    		//append it to the response object
	    		response[encryptedstatename] = statevalue;

	    		cb(); //next item
	    	});
		},
	    // Final callback after each item has been iterated over.
    	function() {
        	callback(response);
        });
    });
};

/**
 * returns a merged set of user into default data - provides all state values for a user
 * @param  {String}   identity user identity
 * @param  {Function} callback
 * @return {undef}            
 */
exports.getStates = getStates = function(identity, callback) {

	getDefaultStates(function(content) {

		//TODO: merge user's state values in

		callback(content);
	});
};

exports.setState = setState = function(identity, statename, value, callback) {
	
	//update db
	var userid = security.decrypt(identity); //get userid by decrypting client identity

	//if valid userid
	if (userid) {

		var updatedstates = {}; //return structure which will inform client about other state updates
		
		getStates(identity, function(states) {

			//does updating this state value update other states?
			if (type.is(states[statename].update, Object)) {

				var firstlevelupdates = {};

				//for each state passed in as changed
			    async.eachSeries(Object.keys(states[statename].update), function(updatestate, cb) {

			    	var updatestateconditions = states[statename].update[updatestate]; //helper

					//we have two different methods of operation: here's an example:
					/*
					"update": {
						"Imager": "off",			//updatestate: updatestateconditions
						"ImagerButtonGoesTo": {		//updatestate: updatestateconditions
							"default": "@163",		//condition: 
							"67": "@162",
							"40": "@164"
						}
					}
					 */
					//1) the conditions are an object and we need to determine which to set based on the state that changed
					if (type.is(updatestateconditions, Object)) {

						//is there a default value on change? set this first, it appiles all the time unless a condition is met
						if (updatestateconditions['default']) {
							firstlevelupdates[updatestate] = updatestateconditions['default'];
						}

						//now check for a match
						for (condition in updatestateconditions) {

							//does this condition match the state value chaged?
							if (condition == value) {
								firstlevelupdates[updatestate] = updatestateconditions[condition]; //value at condition saved as updated state
							}
						}
					}
					//2) if not an object, simply set the update value no matter what (like Imager in the example above)
					else {
						firstlevelupdates[updatestate] = updatestateconditions;
					}

					cb();
			    }, 
			    // Final callback after each item has been iterated over.
			    function() {
			       	
					//ok, we have an firstlevelupdates object with data about other states updated. we actually need to update those states as well now!
				    async.eachSeries(Object.keys(firstlevelupdates), function(firstlevelupdate, cb) {
						
						//set response object
						updatedstates[firstlevelupdate] = firstlevelupdates[firstlevelupdate];

						//now update these first level updates as well!
						setState(identity, firstlevelupdate, firstlevelupdates[firstlevelupdate], function(secondlevelupdates) {

							//and add them to the response object as well
							for (secondlevelupdate in secondlevelupdates) {
								updatedstates[secondlevelupdate] = secondlevelupdates[secondlevelupdate];
							}

							cb(); //next item in series
						});
				    }, 
				    // Final callback after each item has been iterated over.
				    function() {

				    	//let's prepare the database set values
						setdata = {};
						setdata['states.' + statename] = value; //this state
						//all updated states
						for (updatedstate in updatedstates) {
							setdata['states.' + updatedstate] = updatedstates[updatedstate];
						}

						//update database with new state value for this user
						data.setDatabase(identity, 'users', setdata, function() {
							//don't really need to wait
						});	

						callback(updatedstates);

				    });
			    });
			}
			//updating this state does not update others
			else {
				callback({});
			}
		});
	}
	//we did not get a valid userid
	else {
		callback({});
	}
};

/**
 * look through the default state details and determine if the state passed in is supposed to have its client value encrypted or not
 * @param  {String}   statename a state name, must exist in default set or we callback with false
 * @param  {Function} callback  callback function
 * @return {Boolean}            
 */
var isStateValueEncrypted = function(statename, callback) {
	getDefaultStates(function(states) {
		if (type.is(states[statename], Object) && type.is(states[statename].encrypt, Boolean)) {
			callback(states[statename].encrypt);
			return;
		}
		callback(false);
	});
};

var getDefaultStates = function(callback) {

	//get default state set from cache (or file)
	data.getFile('states', 'states', function(content) {
		callback(content);
	}, 0); //0 cache length says keep in cache always!
};