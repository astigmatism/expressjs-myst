var express = require('express');
var router = express.Router();
var type = require('type-of-is');
var statemanager = require('../states.js');
var security = require('../security.js');
var panel = require('../panel.js');
var data = require('../data.js');

/* GET home page. */
router.get('/', function(req, res) {

	data.getDatabaseSingle('configuration', 'server', function(configuration) {

		response = {
			title: 'Myst'
		};

        if (configuration) {
            response.version = configuration.version;
        }

        response.assetpath = config.assetpath || '/assets/'; //default to our local asset directory in /public/assets/

        res.render('index', response);
    });
});

router.post('/touchback', function(req, res) {

	var states = req.param('states');
	var identity = req.param('identity');

	statemanager.clientStatesChanged(identity, states, function(updatedstates) {

		panel.encryptPanelNames(updatedstates, identity); //encrypt all panel id references in state updates

		res.json(updatedstates);
	});
});

module.exports = router;
