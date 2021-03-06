var CONFIG = require('../config/config').config();
var DRAFTAPP = require("../application/draftProjection");
var DRAFTPROJECTION = require("../models/draftProjection");
var PLAYERESPN = require('../application/player/update/espn');
var PLAYERMLB = require('../application/player/update/mlb');
var PLAYERSTATS = require('../application/player/update/stats');
var TEAM = require('../models/team');

module.exports = function(app, passport, io){

	/////
	//MLB
	/////

	app.get("/external/update/mlb", function(req, res) {
		PLAYERMLB.update(function() {});
		res.send('updating.....');
	});

	app.get("/external/update/mlb/:id", function(req, res) {
		PLAYERMLB.update(function(player) {
			res.send("saved " + player.name_display_first_last);
		}, req.params.id);
	});

	app.get("/external/update/espn", function(req, res) {
		PLAYERESPN.updatePlayersFromLeaguePage(function(count) {
			res.send("saved " + count + " players");
		});
	});

	app.get("/external/update/roster40", function(req, res) {
		PLAYERMLB.update40ManRosters(function() {
			res.send("updated 40 man rosters");
		}, io, req.user);
	});

	app.get("/external/update/espnTransactions", function(req, res) {
		PLAYERESPN.updateFromESPNTransactionsPage(function() {
			res.send('finished updating');
		});
	});

	app.get("/external/update/espnTransactions/:year/:month/:day", function(req, res) {
		var date = "" + req.params.year + "" + req.params.month + "" + req.params.day;
		PLAYERESPN.updateFromESPNTransactionsPage(function() {
			res.send('finished updating ' + date);
		}, date);
	});

	app.get("/external/update/espnId", function(req, res) {
		PLAYERESPN.findMissingESPNPlayerIds(function(successCount, failCount) {
			res.send('Found: ' + successCount + ", Still Missing: " + failCount);
		});
	});

	app.get("/external/update/standings/:year", function(req, res) {
		TEAM.getStandings_ESPN(req.params.year, function() {
			res.send("standings updated");
		});
	});

	app.get("/external/update/stats", function(res, res) {
		PLAYERSTATS.updateStats(false, function() {
			res.send('stats updated');
		});
	});
}