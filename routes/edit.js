var express = require('express');
var router = express.Router();
var fs = require('fs-extra');
var async = require('async');
var panel = require('../panel.js');
var multipart = require('connect-multiparty');
var type = require('type-of-is');
var data = require('../data.js');

var multipartMiddleware = multipart();

/* GET home page. */
router.get('/', function(req, res) {
	res.render('edit', { title: 'Myst' });
});

router.get('/panels', function(req, res) {

	var panels = [];

	fs.readdir(__dirname + '/../docs/panels', function (err, list) {

		//for each panel (with encrypted name), load content
        async.eachSeries(list, function(file, callback) {

        	var name = file.replace(/\..*$/g, '');
			var image = null;

			fs.exists(__dirname + '/../public/assets/' + name + '/bg.jpg', function(exists) {

				if (exists) {
					image = '/assets/' + name + '/bg.jpg';
				}

				panels.push({
					name: name,
					image: image,
					docs: 'panels'
				});

				callback(); // next item in series
			});
        }, 
        // Final callback after each item has been iterated over.
        function() {
            res.json(panels);
        });
	});
});

router.get('/zips', function(req, res) {

	data.getFile('zips', 'zips', function(content) {
		res.json({
			content: content,
			assets: []
		});
	}, -1);
});

router.get('/audio', function(req, res) {

	fs.readdir(__dirname + '/../public/assets/audio', function (err, list) {
		res.json(list);
	});
});

/**
 * load is when user loads up a panel in the editor. returns both the panel content unmodified and the panel's assets
 * @param  {[type]} req
 * @param  {[type]} res
 * @return {[type]}
 */
router.get('/load', function(req, res) {
	var panelid = req.param('panel');
	var type = req.param('type');

	console.log(type);

	switch(type) {
		case 'panels':
			panel.get(panelid, function(content) {
				panel.getAssets(panelid, function(assets) {
					res.json({
						content: content,
						assets: assets
					});
				});
			}, -1); //cache length is -1, get from source
			break;
		case 'states':
			data.getFile('states', 'states', function(content) {
				res.json({
					content: content,
					assets: []
				});
			}, -1);
			break;
		case 'zips':
			data.getFile('zips', 'zips', function(content) {
				res.json({
					content: content,
					assets: []
				});
			}, -1);
			break;
	}
});


router.post('/save', function(req, res) {
	var panelid = req.param('panel');
	var type = req.param('type');
	var contents = req.param('data');

	switch (type) {
		case 'panels':
			panel.save(panelid, contents, function() {

			}, -1);
			break;
		case 'states':
			data.setFile('states', 'states', contents, function() {

			}, -1);
			break;
		case 'zips': 
			data.setFile('zips', 'zips', contents, function() {

			}, -1);
			break;
	}

	res.json(contents);
});

router.get('/new', function(req, res) {
	
	var name = -1;

	fs.readdir(__dirname + '/../docs/panels', function (err, list) {
		name = list.length + 1;

		//create asset folder
		fs.mkdir(__dirname + '/../public/assets/' + name);

		console.log('File System folder created: ' + __dirname + '/../public/assets/' + name);

		//read panel template
		fs.readFile(__dirname + '/../docs/paneltemplate.json', function (err, data) {
			if (err) return;
			
			//create new panel
			fs.writeFile(__dirname + '/../docs/panels/' + name + '.json', data, function (err) {
				if (err) return;

				console.log('File System file created: ' + __dirname + '/../docs/panels/' + name + '.json');
				
				res.json(name);
			});

		});
	});
});

router.post('/delete', function(req, res) {
	var panelid = req.param('panel');

	//remove assets folder
	fs.remove(__dirname + '/../public/assets/' + panelid, function(err){
	if (err) return;

		console.log('File System deleted: ' + __dirname + '/../public/assets/' + panelid);

		//remove json file
		fs.remove(__dirname + '/../docs/panels/' + panelid + '.json', function(err){
			if (err) return;

				console.log('File System deleted: ' + __dirname + '/../docs/panels/' + panelid + '.json');

				res.json('');
		});
	});

});

router.use('/assetupload', multipartMiddleware, function(req, res) {
	var panelid = req.param('panel');
	var assetype = req.param('type');
	var files = req.files.files;

	if (files.length > 0) {

		fs.readFile(files[0].path, function (err, data) {

			if (err) {
				console.error('ERROR: File system read of ' + files[0].path);
				return;
			}

			var newPath;
			switch (assetype) {
				case 'bg':
					newPath = __dirname + '/../public/assets/' + panelid + '/bg.jpg';
					break;
				default:
					newPath = __dirname + '/../public/assets/' + panelid + '/' + files[0].originalFilename;
					break;
			}

			fs.writeFile(newPath, data, function (err) {
				if (err) {
					console.error('ERROR: File system writing: ' + newPath);
					return;
				}
				console.log('File system write success: ' + newPath);
			});
		});
	}
	res.json(files);
});

router.post('/deleteasset', function(req, res) {
	var file = req.param('file');
	var panelid = req.param('panel');

	fs.remove(__dirname + '/../public/assets/' + panelid + '/' + file, function(err){
		if (err) return;

		console.log('File System deleted: ' + __dirname + '/../public/assets/' + panelid + '/' + file);
	});
	res.json('');
});


router.get('/source', function(req, res) {
	var name = req.param('name');
	var id = req.param('id');
	var gamesection = req.param('section') || 'Myst';

	//if incoming with name or id, go find the missing data from the card.csv
	getCsvData(gamesection, name, id, function(result) {

		if (result.name && result.id) {

			//now parse through the hotspots csv file and grab all reocrds associated with this id
			fs.readFile(__dirname + '/../source/database/CsvFromNumbers/' + gamesection + '/hotspots.csv', {encoding: 'utf8'}, function (err, data) {
				if (err) {
					console.error('ERROR: File system read error: ' + __dirname + '/../source/database/CsvFromNumbers/' + gamesection + '/hotspots.csv', err);
					res.json('');
					return;
				}
				var lines = data.split('\n'); //split each line

				var hotspots = [];
				var linkedfrom = [];
				
				async.eachSeries(lines, function(line, cb) {

					var regex = /go (\d+)/g;
					var items = line.split(',');
					var match = regex.exec(items[13]); //run match against commands since its needed for both cases

					//did we match this id?
					if (items[2] == result.id) {

						//parse out "go" cardIds from commands
						var go = null;
						console.log(items[13] + ' ' + match);
						if (type.is(match, Array) && match.length > 1) {
							go = match[1];
						}
						getCsvData(gamesection, null, go, function(goresult) {
							
							if (goresult && goresult.name) {
								goresult.name = goresult.name.replace(/\s+\*/g,'');
							}

							hotspots.push({
								id: items[0],
								name: items[1],
								otop: items[3],
								oleft: items[4],
								oheight: items[5],
								owidth: items[6],
								width: items[7],
								height: items[8],
								bottom: items[9],
								left: items[10],
								enabled: items[11],
								event: items[12],
								commands: items[13],
								goto: go,
								gotoname: goresult.name

							});
							
							cb(); // next item in series
						});
					}
					//does this id appear in the commands? (this panel is linked to from another panel)
					else if (type.is(match, Array) && match.length > 1) {

						if (match[1] == result.id) {

							console.log('does match ' + match[1] + ' equal result.id ' + result.id);

							getCsvData(gamesection, null, go, function(goresult) {

								linkedfrom.push({
									id: items[0],
									commands: items[13],
								});
								

								cb(); // next item in series
							});
						} else {
							cb();
						}
					} else {
						cb();
					}
	            },
	            // Final callback after each item has been iterated over.
	            function() {

	                res.render('source', { 
						name: (result.name).replace(/\s+\*/g,''),
						id: result.id,
						hotspots: hotspots,
						linkedfrom: linkedfrom,
						title: 'Myst Source' 
					});
	            });
			});
		}
	});
});

var getCsvData = function(gamesection, name, id, callback) {

	fs.readFile(__dirname + '/../source/database/CsvFromNumbers/' + gamesection + '/card.csv', {encoding: 'utf8'}, function (err, data) {
		if (err) {
			console.error('ERROR: File system read error: ' + __dirname + '/../source/database/CsvFromNumbers/' + gamesection + '/card.csv', err);
			callback({});
			return;
		}

		var lines = data.split('\n'); //split each line
		
		for (var i = 0; i < lines.length; ++i) {
			var items = lines[i].split(',');

			if (items[2] == name) {
				id = items[1];
			}

			if (items[1] == id) {
				name = items[2];
			}
		}
		callback({
			name: name, 
			id: id
		});
	});
};

module.exports = router;
