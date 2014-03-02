var ASYNC = require('async');
var CASH = require('../../models/cash');
var MLDP = require("../../models/minorLeagueDraftPick");
var MAILER = require("../../util/mailer");
var MOMENT = require("moment");
var NOTIFICATION = require('../../models/notification');
var TEAM = require("../../models/team");
var TRADE = require("../../models/trade");

var validateObject = function(tradeObj, tradeValid, message, callback) {
	if(tradeValid) {
		if(tradeObj.itemType === 'PICK') {
			MLDP.findOne({ original_team : tradeObj.originalTeam, team : tradeObj.from, year : tradeObj.year, round : tradeObj.round }, function(err, pick) {
				if(!pick) {
					tradeValid = false;
					TEAM.findOne({ teamId : tradeObj.from }, function(err, team) {
						message = team.fullName + " does not own a pick in round " + tradeObj.round + " of the " +
							tradeObj.year + " minor league draft";
						callback(tradeValid, message);
					});
				} else if(pick.swap && tradeObj.swap) {
					tradeValid = false;
					TEAM.findOne({ teamId : tradeObj.from }, function(err, team) {
						message = team.fullName + " has already given up the rights to swap picks in round " + tradeObj.round + 
							" of the " + tradeObj.year + " minor league draft";
						callback(tradeValid, message);
					});
				} else {
					callback(tradeValid, message);
				}
			});
		} else {
			CASH.findOne({ type : tradeObj.cashType, year : tradeObj.year, team : tradeObj.from }, function(err, cash) {
				if(cash.value - tradeObj.amount < 0) {
					tradeValid = false;
					TEAM.findOne({ teamId : tradeObj.from }, function(err, team) {
						message = team.fullName + " does not have enough " + cash.type + " cash in " + cash.year +
							" to complete this trade.";
						callback(tradeValid, message);
					});
				} else {
					callback(tradeValid, message);
				}
			});
		}
	} else {
		callback(tradeValid, message);
	}
}

var createTrade = function(trade, callback) {
	var newTrade = new TRADE(trade);
	newTrade.status = "PROPOSED";

	var timeParams = { timeframe : 'days'	, units: 3	};
	newTrade.deadline = MOMENT().add(timeParams.timeframe, timeParams.units).format();
	newTrade.save(function(err, trade) {
		var deadlineDisplayTime = MOMENT(newTrade.deadline).format('MMMM Do YYYY, h:mm a [EST]');
		var message = "Your trade has been proposed. The deadline for the recipient to accept the trade is " +
			deadlineDisplayTime;
		createNotificationAndEmail(trade, deadlineDisplayTime);
		callback(message);
	});
}

var createNotificationAndEmail = function(trade, deadlineDisplayTime) {
	var messageForRecipient = "A trade has been proposed to you. Click the 'Trade' tab to check it out";
	NOTIFICATION.createNew('TRADE_PROPOSED', undefined, trade.proposedTo, messageForRecipient);
	TEAM.findOne({ teamId : trade.proposedBy }, function(err, team) {
		MAILER.sendMail({ 
			from: 'Homer Batsman',
			to: [ trade.proposedTo ],
			subject: "New Trade Proposal",
			html: "<h3>You have a new trade proposal!</h3>" +
				"<p>" + team.fullName + " has sent you a trade proposal. The deadline for the trade is " + 
				deadlineDisplayTime + ". To review the trade, <a href='http://homeratthebat.herokuapp.com/trade'>click here</a>."
		}); 
	});
}

var submitTrade = function(trade, responseFunction) {
	var fromReceives = trade.fromReceives;
	var toReceives = trade.toReceives;

	var tradeValid = true;
	var message;

	ASYNC.forEachSeries(trade.items, function(tradeObj, cb) {
		validateObject(tradeObj, tradeValid, message, function(_tradeValid, _message) {
			tradeValid = _tradeValid;
			message = _message;
			cb();
		});
	}, function() {
		if(tradeValid) {
			createTrade(trade, function(message) {
				responseFunction(tradeValid, message);
			});
		} else {
			responseFunction(tradeValid, message);
		}
	});
}

module.exports = {
	submitTrade : submitTrade
}