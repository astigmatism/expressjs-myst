/**
 * User Model
 */

var async = require('async');
var shuffle = require('knuth-shuffle').knuthShuffle;
var data = require('./data.js');
var security = require('./security.js');
var type = require('type-of-is');

exports.getIdentity = function (identity, callback) {

	//if passed in ident is a valid string, use we'll use it, even if its not one we geneated its fine for use
	if (type.is(identity, String)) {
		
		var userid = security.decrypt(identity); //get userid by decrypting client identity

		//if valid userid. if not, we create a new one below
		if (userid) {

			callback(identity);
			return;
		}
	}

	//otherwise find a new unique identity for use.
	data.collectioncount('users', {}, function(usercount) {
		
		if (!type.is(usercount, Number)) {
			callbck(null);
		}

		var userid = ++usercount; //returned current user count, add 1 for new user
			
		identity = security.encrypt(userid.toString()); //encode userid as client identity

		//insert new user record to db and cache
		data.insertDatabase(userid, 'users', {
			"identity": identity,
			"states": {}
		}, 36000);

		callback(identity);
	});
};
