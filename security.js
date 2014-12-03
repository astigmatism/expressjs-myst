/**
 * security model
 */

var crypto = require('crypto');

var defaultKey = "I love playing MYST!";

exports.encrypt = encrypt = function(value, key) {

    if (config.devmode) {
        return value;
    }

	key = key || defaultKey;
	var encrypted = null;
	try {
    	var cipher = crypto.createCipher('aes256', key);
     	encrypted = cipher.update(value, 'utf8', 'hex') + cipher.final('hex');
    } catch (e) {
    	console.error('ERROR: encrypting the string ' + value + ' with key ' + key);
    }

    return encrypted;
};

exports.decrypt = decrypt = function(value, key) {

    if (config.devmode) {
        return value;
    }

    key = key || defaultKey;
    var decrypted = null;
    try {
    	var decipher = crypto.createDecipher('aes256', key);
    	decrypted = decipher.update(value, 'hex', 'utf8') + decipher.final('utf8');
    } catch (e) {
    	console.error('ERROR: decrypting the string ' + value + ' with key ' + key);
    }

    return decrypted;
};

/**
 * keeping in mind that the server ident is built from the client indent, use this function to avoid passing server ident around
 * @param  {[type]} value          [description]
 * @param  {[type]} clientidentity [description]
 * @return {[type]}                [description]
 */
exports.serverencrypt = function(value, clientidentity) {

    var serveridentity = encrypt(clientidentity);

    return encrypt(value, serveridentity);
};

exports.serverdecrypt = function(value, clientidentity) {

    var serveridentity = encrypt(clientidentity);

    return decrypt(value, serveridentity);
};