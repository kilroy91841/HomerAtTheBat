var mongoose = require("mongoose");
var PLAYER = require("./player");
var CONFIG = require("../config/config").config();
var ASYNC = require("async");
var ESPN = require("../external/espn");
var MOMENT = require('moment');
var PLAYERSTATS = require("../application/player/update/stats");
var NUMERAL = require("numeral");
var UTIL = require("../application/util");

var teamSchema = mongoose.Schema({
	teamId: Number,
	team: String,
	owner: String,
	fullName: String,
	preKeeperCash: Number,
	history: [{
		year: Number,
		keeper_total: Number,
		mlb_draft_budget: Number,
		free_agent_draft_budget: Number,
		standings: Number
	}],
	stats: {
		lastUpdated : Date,
		beginDate: Date,
		endDate: Date,
		batting : { 
			ab: { type : Number, default : 0}, 
			h: { type : Number, default : 0}, 
			hr: { type : Number, default : 0}, 
			rbi: { type : Number, default : 0}, 
			r: { type : Number, default : 0}, 
			sb: { type : Number, default : 0}, 
			cs: { type : Number, default : 0}, 
			ao: { type : Number, default : 0}, 
			go: { type : Number, default : 0}, 
			sf: { type : Number, default : 0}, 
			bb: { type : Number, default : 0}, 
			ibb: { type : Number, default : 0},
			hbp: { type : Number, default : 0},
			h2b: { type : Number, default : 0},
			h3b: { type : Number, default : 0},
			obp: { type : Number, default : 0},
			so: { type : Number, default : 0},
			sbp: { type : Number, default : 0},
			woba: { type : Number, default : 0},
			babip: { type : Number, default : 0}
		},
		pitching : { 
			ab: { type : Number, default : 0}, 
			h: { type : Number, default : 0}, 
			hb: { type : Number, default : 0}, 
			so: { type : Number, default : 0}, 
			bb: { type : Number, default : 0},
			er: { type : Number, default : 0}, 
			ip: { type : Number, default : 0}, 
			ao: { type : Number, default : 0}, 
			go: { type : Number, default : 0}, 
			ibb: { type : Number, default : 0}, 
			np: { type : Number, default : 0}, 
			s: { type : Number, default : 0}, 
			hr: { type : Number, default : 0}, 
			sv: { type : Number, default : 0}, 
			w: { type : Number, default : 0},
			whip: { type : Number, default : 0},
			era: { type : Number, default : 0},
			kPerNine: { type : Number, default : 0},
			kPerWalk: { type : Number, default : 0},
			qs: { type : Number, default : 0},
			goao: { type : Number, default : 0},
			tbf: { type : Number, default : 0},
			kPercentage : { type : Number, default : 0},
			bbPercentage : { type : Number, default : 0},
			kPMinusbbP : { type : Number, default : 0},
			fip: { type : Number, default : 0}
		}
	}
}, { collection: 'teams'});

/////////////////
//ROUTE FUNCTIONS
/////////////////

teamSchema.statics.getList = function(req, res, next) {
	Team.find({}).sort({'history.0.standings':1,teamId:1}).exec(function(err, teams) {
		if(err) throw err;
		var teamHash = {};
		teams.forEach(function(team) {
			teamHash[team.teamId] = team;
		});
		req.teamHash = teamHash;
		res.locals.teamHash = teamHash;
		var year = CONFIG.isOffseason ? CONFIG.year - 1 : CONFIG.year;
		res.locals.teams = teams;
		next();
	});
};

///////////
//STANDINGS
///////////

teamSchema.statics.getStandings_ESPN = function(year, callback) {
	ESPN.getESPNStandings(year, function(teamHash) {
		Team.find({}, function(err, teams) {
			teams.forEach(function(team) {
				var historyIndex = findHistoryIndex(team, year);
				if(historyIndex == -1) {
					team.history.unshift({ year : year });
					historyIndex = 0;
				}
				team.history[historyIndex].standings = teamHash[team.teamId];
				team.save();
			});
			callback();
		});
	});
}

teamSchema.statics.updatePlayerToTeam = function(teamId, scoringPeriodId, callback) {
	PLAYER.update({}, { '$pull' : { teamByDate : { '$elemMatch' : { scoringPeriodId : scoringPeriodId } } } }, {'$multi':true}, function() {
		ESPN.getTeamForScoringPeriodId(teamId, scoringPeriodId, function(date, players) {
			ASYNC.forEachSeries(players, function(p, cb) {
				PLAYER.findOne({ espn_player_id : p.playerId }, function(err, player) {
					if(err || !player) {
						console.log('Could not find player with player name ' + p.playerName);
						cb();
					} else {
						var dateTeam = { date : date , team : teamId, 
							fantasy_status_code : UTIL.positionToStatus(p.position), scoringPeriodId : scoringPeriodId };
						if(!player.teamByDate) {
							player.teamByDate = [];
						}
						player.teamByDate.push(dateTeam);
						player.save(function() {
							//console.log("adding " + dateTeam + " to " + p.playerName);
							cb();
						});
					}
				});
			}, function() {
				callback();
			});
		});
	});
}

var getInningsPitched = function(rawInnings) {
	var innArray = rawInnings.split('.');
	var innings_pitched;
	if(isFinite(parseInt(innArray[0]))) {
		innings_pitched = parseInt(innArray[0]);	
	} else {
		innings_pitched = 0;
	}
	if(innArray.length > 1) {
		innings_pitched += parseInt(innArray[1]) / 3;
	}
	return innings_pitched;
}

var resetTeams = function(teamStats, beginDate, endDate, cb) {
	Team.find({ teamId : { $ne : 0 } }).sort({ standings: 1}).exec(function(err, teams) {
		ASYNC.forEach(teams, function(t, innerCB) {
			t.stats.lastUpdated = new Date();
			t.stats.beginDate = beginDate;
			t.stats.endDate = endDate;
			for(var stat in t.stats.batting) {
				if(t.stats.batting.hasOwnProperty(stat)) {
					t.stats.batting[stat] = 0;
				}
			}
			for(var stat in t.stats.pitching) {
				if(t.stats.pitching.hasOwnProperty(stat)) {
					t.stats.pitching[stat] = 0;
				}
			}
			teamStats[t.teamId] = t;
			innerCB();
		}, function() {
			cb();
		});
	});
}

var processGameLogs = function(teamStats, beginDate, endDate, cb) {
	PLAYER.find({player_id:{"$exists":true}}, function(err, players) {
		var playerCount = players.length;
		ASYNC.forEach(players, function(player, innerCB) {
			PLAYERSTATS.getGameLog(player, function(stats) {
				playerCount--;
				if(!stats || stats == {}) { innerCB(); return; }
				if(stats.constructor == Object) { stats = [ stats ]; }
				ASYNC.forEach(stats, function(gameStat, statCB) {
					var gameDate = MOMENT(gameStat.game_date).format('L');
					var isDateInRange = 
						(!endDate && !beginDate) ||
						(!beginDate && gameDate <= endDate) ||
						(!endDate && gameDate >= beginDate) ||
						(gameDate >= beginDate && gameDate <= endDate);
					if(isDateInRange) {
						console.log("DATE IN RANGE:" + gameDate);
						ASYNC.forEach(player.teamByDate, function(playerToTeam, playerCB) {
							if(playerToTeam && playerToTeam.date && playerToTeam.team && playerToTeam.fantasy_status_code == 'A') {
								var playerDate = MOMENT(playerToTeam.date).format('L');
								if(playerDate == gameDate) {
									// FOR DEBUGGING PURPOSES
									// if(playerToTeam.team == 9 && player.primary_position == 1) {
									// 	if(playerToAbs[player.name_display_first_last] == undefined) {
									// 		playerToAbs[player.name_display_first_last] = 0;
									// 	}
									// 	playerToAbs[player.name_display_first_last] += parseInt(gameStat['w']);
									// 	console.log(player.name_display_first_last + " " + gameDate + " " + gameStat['w']);
									// }
									for(var prop in gameStat) {
										var team = playerToTeam.team;
										if(player.primary_position == 1) {
											if(teamStats[team].stats.pitching.hasOwnProperty(prop) && gameStat[prop].length > 0 && isFinite(gameStat[prop])) {
												if(prop == 'ip') {
													var innings_pitched = getInningsPitched(gameStat[prop]);
													teamStats[team].stats.pitching[prop] += innings_pitched;
													if(gameStat['gs'] == 1 && innings_pitched >= 6 && gameStat['er'] <= 3) {
														//console.log(player.name_display_first_last + " " + gameDate + " " + innings_pitched + " " + gameStat['er']);
														teamStats[team].stats.pitching['qs'] += 1;
													}
												} else {
													if(prop != 'whip' && prop != 'era') {
														teamStats[team].stats.pitching[prop] += parseInt(gameStat[prop]);
													}
												}
											}
										} else {
											if(teamStats[team].stats.batting.hasOwnProperty(prop) && gameStat[prop].length > 0 && isFinite(gameStat[prop])) {
												if(prop != 'obp') {
													teamStats[team].stats.batting[prop] += parseInt(gameStat[prop]);
												}
											}
										}
									}
								}	
							}
							playerCB();
						}, function() {
							statCB();
						});
					} else {
						statCB();
					}
				});
				innerCB();
			});
		}, function() {
			cb();
		});
	});
}

var addAdditionalStatsAndSave = function(teamStats, callback) {
	var teamsToSave = [];
	for(var team in teamStats) {
		teamsToSave.push(team);
	}
	ASYNC.forEach(teamsToSave, function(team, ariCB) {
		var obp =
			(teamStats[team].stats.batting.h + teamStats[team].stats.batting.bb + teamStats[team].stats.batting.hbp) / 
			(teamStats[team].stats.batting.ab + teamStats[team].stats.batting.bb + teamStats[team].stats.batting.hbp + teamStats[team].stats.batting.sf);
		if(!isNaN(obp)) {
			teamStats[team].stats.batting.obp = obp;
		}

		var sbp =
			(teamStats[team].stats.batting.sb / (teamStats[team].stats.batting.sb + teamStats[team].stats.batting.cs));
		if(!isNaN(sbp)) {
			teamStats[team].stats.batting.sbp = sbp;
		}

		var battingStats = teamStats[team].stats.batting;
		var h1b = battingStats.h - battingStats.h2b - battingStats.h3b - battingStats.hr;
		var woba = 
			(0.693*battingStats.bb + 0.725*battingStats.hbp + 0.892*h1b + 1.279*battingStats.h2b + 1.627*battingStats.h3b +
			2.118*battingStats.hr) / (battingStats.ab + battingStats.bb - battingStats.ibb + battingStats.sf + battingStats.hbp);
		if(!isNaN(woba)) {
			battingStats.woba = woba;
		}

		var babip =
			(battingStats.h - battingStats.hr) / (battingStats.ab - battingStats.so - battingStats.hr + battingStats.sf);
		if(!isNaN(babip)) {
			battingStats.babip = babip;
		}

		var whip = 
			(teamStats[team].stats.pitching.bb + teamStats[team].stats.pitching.h) / (teamStats[team].stats.pitching.ip);
		if(!isNaN(whip)) {
			teamStats[team].stats.pitching.whip = whip;
		}
		var era = 
			(teamStats[team].stats.pitching.er * 9) / (teamStats[team].stats.pitching.ip);
		if(!isNaN(era)) {
			teamStats[team].stats.pitching.era = era;
		}
		var kPerNine = 
			(teamStats[team].stats.pitching.so * 9) / (teamStats[team].stats.pitching.ip);
		if(!isNaN(kPerNine)) {
			teamStats[team].stats.pitching.kPerNine = kPerNine;
		}

		var kPerWalk =
			(teamStats[team].stats.pitching.so) / (teamStats[team].stats.pitching.bb);
		if(!isNaN(kPerWalk)) {
			teamStats[team].stats.pitching.kPerWalk = kPerWalk;
		}

		var goao =
			(teamStats[team].stats.pitching.go) / (teamStats[team].stats.pitching.ao);
		if(!isNaN(goao)) {
			teamStats[team].stats.pitching.goao = goao;
		}

		var kPercentage =
			(teamStats[team].stats.pitching.so)  / (teamStats[team].stats.pitching.tbf);
		if(!isNaN(kPercentage)) {
			teamStats[team].stats.pitching.kPercentage = kPercentage;
		}
		var bbPercentage =
			(teamStats[team].stats.pitching.bb)  / (teamStats[team].stats.pitching.tbf);
		if(!isNaN(bbPercentage)) {
			teamStats[team].stats.pitching.bbPercentage = bbPercentage;
		}

		var kPMinusbbP =
			(teamStats[team].stats.pitching.kPercentage) - (teamStats[team].stats.pitching.bbPercentage);
		if(!isNaN(kPMinusbbP)) {
			teamStats[team].stats.pitching.kPMinusbbP = kPMinusbbP;
		}

		var fip =
			((13*teamStats[team].stats.pitching.hr)+(3*(teamStats[team].stats.pitching.bb+teamStats[team].stats.pitching.hb))-
				(2*teamStats[team].stats.pitching.so))/teamStats[team].stats.pitching.ip + 3.086;
		if(!isNaN(fip)) {
			teamStats[team].stats.pitching.fip = fip;
		}

		teamStats[team].save(function(data) {
			ariCB();
		});
	}, function() {
		callback(teamStats);
	});
}

teamSchema.statics.updateStats = function(callback, beginDate, endDate) {
	var playerToAbs = {};
	var teamStats = {};
	ASYNC.series([
		function(cb) {
			resetTeams(teamStats, beginDate, endDate, cb);
		},
		function(cb) {
			processGameLogs(teamStats, beginDate, endDate, cb);
		}, 
		function(cb) {
			addAdditionalStatsAndSave(teamStats, callback);
		}
	]);
}

/////////
//HELPERS
/////////

var findHistoryIndex = function(player, year) {
	if(!player.history) {
		return -1;
	}
	for(var i = 0; i < player.history.length; i++) {
		if(player.history[i].year == year) {
			return i;
		}
	}
	return -1;
}

var createStats = function() {
	return {
		year: CONFIG.year,
		ab : 0,
		ip : 0,
		r : 0,
		rbi : 0,
		obp : 0,
		hr : 0,
		sb : 0,
		w : 0,
		era : 0,
		so : 0,
		whip : 0,
		sv : 0,
		batter_bb : 0,
		pitcher_bb : 0,
		hbp : 0,
		h2b : 0,
		h3b : 0,
		ibb : 0,
		cs : 0,
		sac : 0,
		sf : 0,
		go : 0,
		ao : 0,
		so: 0
	};
}

teamSchema.statics.setVultureProperties = function(players) {
	players.forEach(function(player) {
		var isVultured = player.vulture && player.vulture.is_vultured;
		var vulturable = !isVultured && (player.status_code != player.fantasy_status_code) && 
			!player.history[player.history_index].minor_leaguer;
		player.isVultured = isVultured;
		player.vulturable = vulturable;
	});
	return players;
}

var Team = mongoose.model('Team', teamSchema);
module.exports = Team;
