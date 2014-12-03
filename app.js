var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var configuration = require('./config.js');
var data = require('./data.js');
var type = require('type-of-is');

var routes = require('./routes/index');
var panels = require('./routes/panels');
var edit = require('./routes/edit');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/panels', panels);

//pull in app configuration
GLOBAL.config = configuration.data.production;

//development only
if (app.get('env') === 'development') {

    app.use('/edit', edit);
    GLOBAL.config = configuration.data.development;
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


console.log('environment: ' + app.get('env')); //show env in console for verification

//increment run counter
data.getDatabaseSingle('configuration', 'server', function(configuration) {
    if (configuration) {
        var runcount = (configuration.runcounter + 1);
        data.setDatabase('configuration', 'server', {
            runcounter: runcount,
            version: config.version + '.' + runcount
        });    
    } else {
        data.insertDatabase('configuration', 'server', {
            identity: 'configuration',
            runcounter: 0,
            version: config.version + '.0'
        }, 0);
    }
});


module.exports = app;
