var HELPERS = require("./helpers");
var MOMENT = require('moment');
var PLAYER = require("../../models/player");
var SCHEDULE = require('node-schedule');
var ENDVULTURE = require("./endVulture");
var ASYNC = require('async');
var MAILER = require("../../util/mailer");
var NOTIFICATION = require('../../models/notification');

var submitVulture = function(vulture_id, removing_id, user, redirect) {
	HELPERS.isVultureLegal(vulture_id, removing_id, function(isLegal, pid, message) {
		if(isLegal) {
			PLAYER.findOne({ _id : vulture_id }, function(err, vulture_player) {
				PLAYER.findOne({_id: removing_id}, function(err, removing_player) {
					createVulture(vulture_player, removing_player, user, redirect);
				});
			});			
		} else {
			if(pid == vulture_id) {
				redirect(message, "/gm/vulture");
			} else {
				redirect(message, "/gm/vulture/" + vulture_id);
			}
		}
	});
};

var setAsVultured = function(vulture_player, drop_player, vulturing_team) {
	vulture_player.vulture.is_vultured = true;
	vulture_player.vulture.vulture_team = vulturing_team;
	var timeParams = { timeframe : 'hours'	, units: 24	};
	var deadline = MOMENT().add(timeParams.timeframe, timeParams.units).format();
	vulture_player.vulture.deadline = deadline;

	drop_player.vulture.vultured_for_id = vulture_player._id;
	console.log(drop_player.vulture);
}

var createVulture = function(vulture_player, drop_player, user, redirect) {
	setAsVultured(vulture_player, drop_player, user.team);

	ASYNC.series([
		function(cb) {
			vulture_player.save(function() {
				cb();
			});
		}, function(cb) {
			drop_player.save(function() {
				cb();
			});
		}, function(cb) {
			console.log(drop_player.vulture);
			sendCreateMail(vulture_player);
			scheduleExpiration(vulture_player, drop_player);
			createNotification(vulture_player);

			var deadlineDisplayTime = MOMENT(vulture_player.vulture.deadline).format('MMMM Do YYYY, h:mm a [EST]');
			redirect("Vulture successful. Deadline is " + deadlineDisplayTime + ".", "/gm/vulture");
			cb();
	}]);
};

var sendCreateMail = function(vulture_player) {
	var deadlineDisplayTime = MOMENT(vulture_player.vulture.deadline).format('MMMM Do YYYY, h:mm a [EST]');
	var html = vulture_player.vulture.vulture_team + " is trying to vulture " + vulture_player.name_display_first_last + ". " +
			vulture_player.history[vulture_player.history_index].fantasy_team + " has until " + deadlineDisplayTime + " to fix it.";
	MAILER.sendMail({ 
		from: 'Homer Batsman',
		to: [ vulture_player.history[vulture_player.history_index].fantasy_team ],
		subject: vulture_player.name_display_first_last + " has been vultured",
		html: html
	});
}

var scheduleExpiration = function(vulture_player, drop_player) {
	SCHEDULE.scheduleJob(vulture_player.vulture.deadline, function() {
		PLAYER.findOne({ _id : vulture_player._id }, function(err, dbPlayer) {
			if(dbPlayer.vulture && dbPlayer.vulture.is_vultured) {
				ENDVULTURE.handleVultureExpiration(vulture_player._id, drop_player._id);
			}
		});
	});
}

var createNotification = function(vulture_player) {
	var vulture_history = vulture_player.history[vulture_player.history_index];
	NOTIFICATION.createNew('VULTURE', vulture_player.name_display_first_last, vulture_history.fantasy_team, 
		vulture_player.name_display_first_last + " is being vultured. Check Vulture page for more details.", function() {});
}

module.exports = {
	submitVulture : submitVulture
}