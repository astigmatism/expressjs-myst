/**
 * Panel Controller (Route)
 */

var express = require('express');
var router = express.Router();
var panel = require('../panel.js');
var user = require('../user.js');
var security = require('../security.js');
var async = require('async');
var type = require('type-of-is');
var statemanager = require('../states.js');
var data = require('../data.js');

router.get('/', function(req, res) {
    
    var panels          = req.param('panels');              //all panel ids are coming in encrypted with the last serverindentity. if none exist, we'll return the first panel
    var identity        = req.param('identity', null);    //user passes back identity to retrieve state, null will assign new one
    var states          = req.param('states');
        
    //first order of business: generate a server ident using passed in client indent or from new one. we use it to encryt states and panel id's
    user.getIdentity(identity, function(identity) {

        //abolsutely critical identity is encrypted string
        if (!type.is(identity, String)) {
            res.json(null);
            return;
        }

        //response object prep
        var response = {
            'identity': identity,
            'panels': {},
            'states': {},
            'version': 0
        };

        //game begin scenario: if myst passed in or url param not present
        if (panels === 'myst' || !type.is(panels, String)) {
            
            panels = [security.serverencrypt('0', identity)];
        } 
        //is string
        else {
            panels = panels.replace(/[^\w,'-]/g, '').split(',');
            if (!type.is(panels, Array)) {
                panels = [panels];
            }
        }

        //is this call being doubled as a touchback? i.e. are there state changes to process?
        statemanager.clientStatesChanged(identity, states, function(updatedstates) {

            //if updated states returned, inform the client
            if (updatedstates) {
                response.states = updatedstates;
            }

            //for each panel (with encrypted name), load content
            async.eachSeries(panels, function(panelid, callback) {

                //get panel contents (with decrypted panel id obviously)
                panel.get(security.serverdecrypt(panelid, identity), function(content) {
                    
                    if (!content) {
                        callback(); // next item in series
                        return;
                    }

                    //set panel navigation zip mode data (do this before states in case zip data uses them)
                    panel.setPanelNavigationZips(content, function(content) {

                        //set states used by this panel
                        panel.setPanelStates(content, identity, function(content, states) {

                            response.panels[panelid] = content;

                            //append states used to our response object.. and always encrypt names
                            for (state in states) {
                                var statenameencrypted = security.serverencrypt(state, identity);
                                response.states[statenameencrypted] = states[state]; //save state value to response object
                            }

                            callback(); // next item in series
                        });
                    });

                }, 0); //cache length says never expire this panel content!
            }, 
            // Final callback after each item has been iterated over.
            function() {

                panel.encryptPanelNames(response, identity); //encrypt all panel id references for all panel content and states

                //finally append the server run count (we'll validate it on the client to ensure client ver and server ver match)
                data.getDatabaseSingle('configuration', 'server', function(configuration) {

                    if (configuration) {
                        response.version = configuration.version;
                    }

                    res.json(response);
                });
            });

        });
    });
});

module.exports = router;
