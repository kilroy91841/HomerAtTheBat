var PLAYER = require('../models/player');
var APP = require('../application/app');
var WATCHLIST = require('../models/watchlist');

module.exports = function(app, passport){

	///////
	//API
	///////

	app.post("/api/players", function(req, res) {
		PLAYER.find({}, function(err, players) {
			players.sort(function(a,b) {
				var lastA = a.name_display_first_last.split(' ')[a.name_display_first_last.split(' ').length - 1];
				var lastB = b.name_display_first_last.split(' ')[b.name_display_first_last.split(' ').length - 1];
				if(!lastA || !lastB) {
					return -1;
				}
				if(lastA < lastB) {
					return -1;
				} else if(lastB < lastA) {
					return 1;
				} else {
					return -1;
				}
			});
			res.send(players);
		});
	});

	app.get("/api/watchlist/encrypted", APP.isUserLoggedIn, function(req, res) {
		WATCHLIST.find({team : req.user.team}, function(err, encrypteds) {
			res.send(encrypteds);
		});
	});
}