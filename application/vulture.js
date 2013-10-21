var PLAYER = require("../models/player");
var ADMIN = require("./admin");

var removeVulture = function(player) {
	player.vulture.deadline = undefined;
	player.vulture.is_vultured = false;
	player.vulture.vulture_team = undefined;
}

var setAsVultured = function(player, user) {
	player.vulture.is_vultured = true;
	player.vulture.vulture_team = user.team;
	var deadline = new Date();
	player.vulture.deadline = deadline.setDate(deadline.getDate() + 1);
}

var createVulture = function(vulture_player, removed_player, user, callback) {
	var vulture_valid = vulture_player.vulture == undefined || vulture_player.vulture.is_vultured == false;
	var remove_valid = removed_player.vulture == undefined || 
		(removed_player.vulture.is_vultured == false && removed_player.vulture.vultured_for_pid == undefined);

	if(vulture_valid && remove_valid) {
		setAsVultured(vulture_player, user);
		removed_player.vulture.vultured_for_pid = vulture_player.player_id;
		vulture_player.save();
		removed_player.save();
		callback("vulture successful");
	} else if(!vulture_valid) {
		callback("player not eligible to be vultured");
	} else if(!remove_valid) {
		callback("player chosen to be dropped already in a pending vulture");
	}
};

exports.getVulturesForTeam = function(req, res, next) {
	if(req.user != null ) {
		PLAYER.find({fantasy_team: req.user.team, 'vulture.is_vultured':true}, function(err, doc) {
			req.open_vultures = doc;
			next();
		});
	} else {
		req.open_vultures = [];
		next();
	}
}

exports.updateStatusAndCheckVulture = function(pid, callback) {
	ADMIN.updateMLB(pid, function(player) {
		ADMIN.updateESPN(player.espn_player_id, function(player) {
			if(player.status_code == player.fantasy_status_code) {
				removeVulture(player);
				player.save();
				callback("vulture averted");
			} else {
				callback("player still vulturable");
			}
		});
	});
};
exports.isVultureEligible = function(req, res, next) {
	PLAYER.findOne({player_id: req.params.pid}, function(err, player) {
		if(err) throw err;
		var attemptToVulture = player.fantasy_team != req.user.team && (player.vulture == undefined || player.vulture.is_vultured == false);
		var attemptToFix = player.fantasy_team == req.user.team && player.vulture != undefined && player.vulture.is_vultured == true;
		if(attemptToVulture) {
			req.player = player;
			next();
		} else if(attemptToFix) {
			req.player = player;
			req.attemptToFix = true;
			next();
		} else {
			res.redirect("/team/" + req.user.team);	
		}
	});
};

exports.submitVulture = function(vulture_pid, removing_pid, user, callback) {
	PLAYER.findOne({player_id: vulture_pid}, function(err, doc) {
		var vulture_player = doc;
		PLAYER.findOne({player_id: removing_pid}, function(err, doc) {
			var removing_player = doc;
			createVulture(vulture_player, removing_player, user, callback);
		});
	});
};