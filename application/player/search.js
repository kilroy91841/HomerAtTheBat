var CONFIG = require("../../config/config").config();
var PLAYER = require("../../models/player");

var findPlayersMissingESPNIds = function(cb) {
	PLAYER.find({ $or : [ { espn_player_id : { $exists : false }} , { espn_player_id : 1 } ] })
		.sort({ name_display_first_last : 1 })
		.exec(function(err, players) {
			if(err) throw err;
			cb(players);
		}
	);
};

var findFreeAgents = function(cb) {
	var search = { history: { "$elemMatch" : { year: CONFIG.year, fantasy_team : 0 }}};
	PLAYER.find(search, function(err, freeAgents) {
		cb(freeAgents);
	});
}

module.exports = {
	findPlayersMissingESPNIds : findPlayersMissingESPNIds,
	findFreeAgents : findFreeAgents
}