var AUTH = require('../config/authorization');
var ADMIN = require('../application/admin');
var VULTURE = require('../application/vulture');
var FREEAGENTAUCTION = require('../models/freeAgentAuction');
var PLAYER = require('../models/player');

module.exports = function(app, passport){

	app.get("/admin", VULTURE.getOpenVultures, FREEAGENTAUCTION.getFinishedAuctions, function(req, res) {
		var str = req.flash('info');
		res.render("admin", 
			{
				message: str
			});
	});

	app.get("/admin/player/:pid", function(req, res) {
		PLAYER.findOne({player_id:req.params.pid}, function(err, player) {
			res.render("adminPlayer", { 
				player: player
			});
		});
	});

	app.get("/admin/mlb/update/:pid", function(req, res) {
		ADMIN.updateMLB(req.params.pid, function(player) {
			res.redirect("/admin/player/" + player.player_id);
		});
	});

	app.get("/admin/espn/update/:pid", function(req, res) {
		ADMIN.updateESPN(req.params.pid, function(player) {
			res.redirect('/admin/player/' + player.player_id);
		});
	});

	app.post("/admin/player/search", function(req, res) {
		PLAYER.find({name_display_first_last:new RegExp(" " + req.body.searchString)}).sort({name_display_first_last:1}).exec(function(err, players) {
			res.send(players);
		});
	});

	app.get("/admin/mlb/updateAll", function(req, res) {
		ADMIN.updateMLB_ALL(function(message) {
			res.send(message);
		});
	});

	app.get("/admin/espn/updateAll", function(req, res) {
		ADMIN.updateESPN_ALL(function(message) {
			res.send(message);
		});
	});

	app.post("/admin/json/update", function(req, res) {
		console.log(req.body.json);
		var json = JSON.parse(req.body.json);
		PLAYER.findByIdAndUpdate(json._id, json, function(err, data) {
			console.log(data);
			res.send(data);
		});
	});

	app.post("/admin/vulture", function(req, res) {
		console.log("VULTURE PID:" + req.body);
		VULTURE.overrideVultureCancel(req.body.pid, function(message) {
			req.flash('info', message);
			res.redirect('/admin');
		});
	});

	app.get("/admin/espntester/:type", function(req, res) {
		ADMIN.updateESPN_Transactions(req.params.type);
		res.send('ok');
	});
}
