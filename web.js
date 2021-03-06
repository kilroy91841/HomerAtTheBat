//Module dependencies
var 	express = require("express"),
	mongoose = require("mongoose"),
	passport = require("passport"),
	http = require("http"),
	fs = require("fs"),
	flash = require("connect-flash"),
	numeral = require("numeral"),
	relic = require('newrelic');
var MongoStore = require('connect-mongo')(express);

//Environment variables
var 	env = process.env.NODE_ENV || 'development';
var 	config = require('./config/config').setUpEnv(env).config();
var memwatch = require('memwatch');

//Database connection
mongoose.connect(config.db);
mongoose.set('debug', true);

var models_dir = __dirname + '/models';
fs.readdirSync(models_dir).forEach(
	function (file) {
		if(file[0] === '.') return;
		if(file.indexOf("~") != -1) return;  
		require(models_dir+'/'+ file);
	}
);

//Passport setup
require('./config/passport')(passport);
var TEAM = require("./models/team");
var NOTIFICATION = require("./models/notification");

//Express
var app = express();
app.configure(function() {
	console.log("starting");
	app.set('port', process.env.PORT || 5000);
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.set('envConfig', config);
	console.log("here");
	app.use(express.logger());
	app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.session({
		secret: 'h0m3r',
		store: new MongoStore({
			url: config.db
		})
	}));
	app.use(passport.initialize());
	app.use(passport.session());
	app.use(express.methodOverride());
	app.use('/public', express.static(__dirname + '/public'));
	app.use(flash());
	app.use(function(req, res, next) {
		res.locals.user = req.user;
		res.locals.envConfig = config;
		res.locals.numeral = numeral;
		next();
	});
	app.use(NOTIFICATION.getOpenNotifications);
	app.use(TEAM.getList);
	app.use(app.router);
	app.locals.moment = require('moment');
});

app.configure('development', function () {
	app.use(express.errorHandler());
});

var server = http.createServer(app);
server.listen(app.get('port'), function () {
    console.log("Express server listening on port " + app.get('port'));
});

var io = require('socket.io').listen(server);
io.set('log level', 2);
io.sockets.on('connection',function(socket){ 
	socket.on('join', function(data) {
		socket.join(data.user);
	});
});

var routes_dir = __dirname + '/routes';
fs.readdirSync(routes_dir).forEach(
	function (file) {
		if(file[0] === '.') return;
		if(file.indexOf("~") != -1) return;  
		require(routes_dir+'/'+ file)(app, passport, io);
	}
);

require('./application/jobs').kickOffJobs(config);

memwatch.on('leak', function(info) { 
	console.log(info);
});