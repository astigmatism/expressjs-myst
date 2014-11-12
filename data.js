/**
 * Data abstraction layer
 */
var Memcached = require('memcached');
var fs = require('fs');
var mongo = require('mongodb');
var monk = require('monk');
var db = monk('localhost:27017/myst');
var config = require('./config.js');
var type = require('type-of-is');

var memcached = new Memcached('localhost:11211', {
    retries: 10,
    retry: 10000
});

exports.getFile = function(file, collection, callback, cachelength) {
    
    cachelength = cachelength || -1; //when -1, avoid using cache altogether

    var cachekey = collection + '.' + file;

    //attempt cache get
    memcached.get(cachekey, function(err, data) {

        if (err) {
            console.error('ERROR: Memcached get error for ' + cachekey);
            callback(null);
            return;
        }

        //successful cache hit will return record
        if (data && cachelength !== -1 && !config.devmode) {
            console.info('Memcached get success. ' + cachekey);
            callback(data);
            return;
        }

        //no successful cache hit, find in file system and add to cache
        fs.readFile(__dirname + '/docs/' + collection + '/' + file + '.json', 'utf8', function(err, content) {
            
            if (err) {
                console.error('ERROR: file system error opening: ' + collection + '/' + file);
                callback(null);
                return;

            } else {

                //JSON parse file contents, comes in as string
                try {
                    content = JSON.parse(content);
                } catch (e) {
                    console.error('In attempting to JSON.parse the file: ' + collection + '/' + file + '.json an error occured:', e);
                    callback(null);
                    return;
                }

                console.info('File system get success: ' + collection + '/' + file);

                //set cache
                setCache(cachekey, content, cachelength);
            }
            callback(content);        
        });
    });
};

exports.setFile = function (file, collection, content, cachelength) {

    cachelength = cachelength || -1; //-1 says don't cache at all

    var cachekey = collection + '.' + file;

    fs.writeFile(__dirname + '/docs/' + collection + '/' + file + '.json', content, function (err) {
        if (err) {
            console.error('ERROR: file system error saving: ' + collection + '/' + file);
            return;
        }
        
        console.info('File system save success: ' + collection + '/' + file);

        //remove cached version on successful save
        removeCache(cachekey);

        setCache(cachekey, content, cachelength); //cachelength will determine to readd to cache

    });
};

exports.insertDatabase = function(identity, collection, content, cachelength) {

    cachelength = cachelength || -1; //-1 says don't cache at all

    // Submit to the DB
    if (!config.devmode) {

        // Set our collection
        var dbcollection = db.get(collection);

        dbcollection.insert(content, function (err) {
            if (err) {
                console.error('ERROR: inserting into db collection "' + collection + '", identity "' + identity + '" with content:', content);
            }

            console.info('Mongo insert success. collection ' + collection);

            //add to cache
            setCache(collection + '.' + identity, content, cachelength);
        });
    }
};

exports.getDatabase = function (identity, collection, callback, cachelength) {

    cachelength = cachelength || -1; //when -1, avoid using cache altogether

    var cachekey = collection + '.' + identity;

    //attempt cache get
    memcached.get(cachekey, function(err, data) {

        if (err) {
            console.error('ERROR: Memcached get error for ' + cachekey);
            callback(null);
            return;
        }

        //successful cache hit will return record
        if (data && cachelength !== -1 && !config.devmode) {
            console.info('Memcached get success. ' + cachekey);
            callback(data);
            return;
        }

        //no successful cache hit, find in the db and add to cache
        var dbcollection = db.get(collection);

        dbcollection.find({
            "identity": identity
        }, function(err, docs) {
            if (err) {
                console.error('ERROR: getting db collection "' + collection + '", identity "' + identity);
                callback([]);
                return;
            }

            console.info('Mongo get success. collection ' + collection + ' identity ' + identity);

            //set cache
            setCache(cachekey, docs, cachelength);

            callback(docs);
        });
    });
};

//a wrapper function for the above which returns the first record instead of a set
exports.getDatabaseSingle = function(identity, collection, callback, cachelength) {
    this.getDatabase(identity, collection, function(docs) {
        if (docs.length > 0 && docs[0]) {
            callback(docs[0]);
            return;
        }
        callback(null);
    }, cachelength);
};

exports.setDatabase = function (identity, collection, setvalue, callback) {

    // Set our collection
    var dbcollection = db.get(collection);

    dbcollection.update({
        "identity": identity
    }, {
        $set: setvalue
    }, function(err, docs) {
        if (err) {
            console.error('ERROR: updating db collection "' + collection + '", identity "' + identity + '" with content:' + setvalue, err);
            if (callback) {
                callback([]);
            }
            return;
        }

        //docs returns the count of the documents updated. when 0, do an insert instead
        if (docs === 0) {
            console.warn('Mongo set returns 0 for docs updated. Check query. collection ' + collection + ' identity ' + identity);
        } else {
            console.info('Mongo set success. collection ' + collection + ' identity ' + identity);
        }

        //on successful set, simply clear cache of this record at this time (instead of updating cache or resetting cache)
        removeCache(collection + '.' + identity);

        if (callback) {
            callback(docs);
        }
    });
};

var setCache = function(cachekey, content, cachelength) {
    
    cachelength = cachelength || -1;
    
    if (cachelength > -1 && !config.devmode) {
        memcached.set(cachekey, content, cachelength, function (err) {
            if (err) {
                console.error('ERROR: Memcached set error for ' + cachekey, content);
            } else {
                console.info('Memcached set success. ' + cachekey);
            }
        });
    }
};

var removeCache = function(cachekey) {
    memcached.del(cachekey, function(err) {
        if (err) {
            console.error('ERROR: Memcached del error for ' + cachekey);
        } else {
            console.info('Memcached del success. ' + cachekey);
        }
    });
};

exports.collectioncount = function(collection, query, callback) {
    query = query || {};
    var collection = db.get(collection);
    collection.count(query, function(err, docs) {
        if (!type.is(docs, Number)) {
            console.error('ERROR: mongo db returned non-number for count of ' + collection + ':', docs);
            callback(null);
        }
        callback(docs);
    });
};
