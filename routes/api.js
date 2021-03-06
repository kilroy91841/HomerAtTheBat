var APP = require('../application/app');
var ASYNC = require('async');
var CASH = require('../models/cash');
var CONFIG = require("../config/config").config();
var MLB = require('../external/mlb');
var MOMENT = require('moment');
var NUMERAL = require('numeral');
var PLAYER = require('../models/player');
var PLAYERSEARCH = require("../application/player/search");
var PLAYERSTATS = require("../application/player/update/stats");
var SCHEDULE = require('../application/schedule');
var TEAM = require("../models/team");
var TEAMSORT = require("../application/sort");
var TEAMSEARCH = require("../application/team/search");
var TEAMSTATS = require("../application/team/stats");
var VULTUREROUTE = require("../application/vulture/route");
var WATCHLIST = require('../models/watchlist');

module.exports = function(app, passport){

	///////
	//API
	///////

	app.post("/api/players", function(req, res) {
		PLAYER.find({}).sort({ name_last : 1, name_first : 1 }).exec(function(err, players) {
			res.render("partials/playerList", {
				players: players
			});
		});
	});

	app.post("/api/players/screen", function(req, res) {
		var params = { history : { year : CONFIG.year } };
		if(req.body) {
			if(req.body.fantasy_team) {
				params.history.fantasy_team = req.body.fantasy_team;	
			}
			if(req.body.positions) {
				params.positions = req.body.positions;
			}
			if(req.body.forceStats) {
				params.forceStats = req.body.forceStats;
			}
			if(req.body.categories) {
				params.categories = req.body.categories;
			}
		}
		PLAYERSEARCH.findFreeAgents(params, function(batters, pitchers) {
			var batterHtml;
			var pitcherHtml;
			res.render("partials/freeAgentTable", {
				isHitter : true,
				dbPlayers : batters,
				numeral : NUMERAL
			}, function(err, html) {
				batterHtml = html;
				res.render("partials/freeAgentTable", {
					isHitter : false,
					dbPlayers : pitchers,
					numeral : NUMERAL
				}, function(err, html) {
					pitcherHtml = html;
					res.send({ batterHtml : batterHtml, pitcherHtml : pitcherHtml });
				});
			});
		});
	});

	app.post("/api/players/filtered/name", function(req, res) {
		var text = req.body.text;
		var search = { name_display_first_last : new RegExp(text,"i") };
		PLAYER.find(search, function(err, players) {
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
			var isAdmin = req.user ? req.user.role == 'admin' : false;
			res.render("partials/playerList", {
				isAdmin: isAdmin,
				players: players
			}, function(err, html) {
				res.send({ html : html, searchTerm : text });
			});
		});
	})

	app.get("/api/watchlist/encrypted", APP.isUserLoggedIn, function(req, res) {
		WATCHLIST.find({team : req.user.team}, function(err, encrypteds) {
			res.send(encrypteds);
		});
	});

	app.get("/api/schedule/players/:id", function(req, res) {
		SCHEDULE.getPlayersInGames(req.params.id, function(games) {
			res.render("partials/mlbSchedule", {
				games : games,
				showSpinner : false
			}, function(err, html) {
				res.send({ html : html });
			})
		})
	});

	app.get("/api/vultureeee", function(req, res) {
		VULTUREROUTE.getVulturablePlayers(req, res, function() {
			var userHtml;
			var leagueHtml;
			res.render("partials/vultureTable", {
				players : res.locals.userVulturablePlayers,
				isUsersPlayers : true,
				defaultMessage : "You have no vulturable players",
				teamHash : res.locals.teamHash
			}, function(err, html) {
				userHtml = html;
				res.render("partials/vultureTable", {
					players : res.locals.leagueVulturablePlayers,
					isUsersPlayers : false,
					defaultMessage : "There are no vulturable players",
					teamHash : res.locals.teamHash
				}, function(err, html) {
					leagueHtml = html;
					res.send({ userHtml : userHtml, leagueHtml : leagueHtml});
				});
			});
		});
	});

	var addToActiveStats = function(totalsByTeam, team, gameStat) {
		if(!totalsByTeam[team]) {
			totalsByTeam[team] = {};
		}
		var props = [ 'hr', 'sb', 'r', 'rbi', 'ab', 'h', 'bb', 'hbp', 'sf', 'so', 'w', 'sv', 'ip', 'er' ];
		for(var i = 0; i < props.length; i++) {
			var prop = props[i];
			if(prop == 'ip' && gameStat[prop]) {
				var innArray = gameStat[prop].split('.');
				var innings_pitched;
				if(isFinite(parseInt(innArray[0]))) {
					innings_pitched = parseInt(innArray[0]);	
				} else {
					innings_pitched = 0;
				}
				if(innArray.length > 1) {
					innings_pitched += parseInt(innArray[1]) / 3;
				}
				totalsByTeam[team][prop] = 
					!totalsByTeam[team][prop] ? 
					innings_pitched : 
					totalsByTeam[team][prop] + innings_pitched;
			} else {
				totalsByTeam[team][prop] = 
					!totalsByTeam[team][prop] ? 
					parseInt(gameStat[prop]) : 
					totalsByTeam[team][prop] + parseInt(gameStat[prop]);
			}
		}
		totalsByTeam[team].obp =
			(totalsByTeam[team].h + totalsByTeam[team].bb + totalsByTeam[team].hbp) / (totalsByTeam[team].ab + totalsByTeam[team].bb + totalsByTeam[team].hbp + totalsByTeam[team].sf);
		if(totalsByTeam[team].ip && totalsByTeam[team].ip > 0) {
			totalsByTeam[team].whip =
				(totalsByTeam[team].bb + totalsByTeam[team].h) / (totalsByTeam[team].ip);
			totalsByTeam[team].era = 
				(totalsByTeam[team].er * 9) / totalsByTeam[team].ip;
		}
		
	}

	app.get("/api/player/gameLog/:id", function(req, res) {
		PLAYER.findOne({ _id : req.params.id }, function(err, player) {
			if(player.teamByDate && player.teamByDate.length > 0) {
				var totalsByTeam = {};
				PLAYERSTATS.getGameLog(player, function(stats) {
					if(!stats) { 
						stats = {}; 
					}
					if(stats.constructor == Object) { stats = [ stats ]; }
					ASYNC.forEach(stats, function(gameStat, statCB) {
						var gameDate = MOMENT(gameStat.game_date).format('L');
						ASYNC.forEach(player.teamByDate, function(playerToTeam, playerCB) {
							if(playerToTeam && playerToTeam.date) {
								var playerDate = MOMENT(playerToTeam.date).format('L');
								if(playerDate == gameDate) {
									playerToTeam.stats = gameStat;
									if(playerToTeam.fantasy_status_code == 'A') {
										addToActiveStats(totalsByTeam, playerToTeam.team, gameStat);	
									}
								}
							}
							playerCB();
						}, function() {
							statCB();
						});
					}, function() {
						res.render("partials/playerStatByDate", {
							player : player,
							moment : MOMENT,
							teamHash : res.locals.teamHash
						}, function(err, playerStatByDateHtml) {
							res.render("partials/playerStatByTeam", {
								player : player,
								moment : MOMENT,
								totalsByTeam : totalsByTeam,
								teamHash : res.locals.teamHash
							}, function(err, playerStatByTeamHtml) {
								res.send({ 
									playerStatByDateHtml : playerStatByDateHtml, 
									playerStatByTeamHtml : playerStatByTeamHtml
								});
							});
							
						});
					});
				});
			} else {
				res.send({ html : undefined });
			}
		});
	});

	app.get("/api/player/milb/:id", function(req, res) {
		var _id = req.params.id;
		PLAYERSTATS.getMILBInfo(_id, function(bio, stats) {
			if(bio && bio.status == "Active" 
				&& bio.leagueName != undefined) {
				res.render("partials/minorLeagueInfo", {
					bio : bio,
					stats : stats
				}, function(err, html) {
					res.send({ html : html, bio : bio });
				});	
			} else {
				res.send({ html : undefined });
			}
		});
	});

	app.get("/api/team/milb/:id", function(req, res) {
		var teamId = req.params.id;
		TEAMSEARCH.getPlayers(CONFIG.year, teamId, true, function(players) {
			var milbInfo = {};
			ASYNC.forEach(players, function(player, cb) {
				PLAYERSTATS.getMILBInfo(player._id, function(bio, stats) {
					milbInfo[player._id] = { bio : bio, stats : stats };
					cb();
				});
			}, function() {
				res.send({ milbInfo : milbInfo });
			});
		});
	});

	app.get("/api/player/mlb/:id", function(req, res) {
		var id = req.params.id;
		MLB.getMLBProperties(id, function(json) {
			res.send(json);
		});
	});

	app.get("/api/stats/daily/clear", function(req, res) {
		res.send('clearing...');
		PLAYERSTATS.clearDailyStats(function() {});
	});

	app.get("/api/stats/update/daily/:id", function(req, res) {
		SCHEDULE.getSchedule(function(games) {
			PLAYERSTATS.updateDailyStats(games, function() {
				var search = { history: { "$elemMatch" : { year: CONFIG.year, fantasy_team : req.params.id }}};
				TEAMSEARCH.getPlayers(CONFIG.year, req.params.id, false, function(players) {
					var todaysTotals = { batting : {}, pitching : {} };
					players.forEach(function(p) {
						games.forEach(function(g) {
							if(p.team_id == g.homeTeamId || p.team_id == g.awayTeamId) {
								p.game = g;
								var now = Date.parse(new Date());
								var gameTime = Date.parse(g.timeDate);
								if(gameTime <= now)  {
									p.game.started = true;
								}
							}
						});
						
						var battingCategories = ['ab', 'hr', 'r', 'rbi', 'sb', 'sf', 'hbp', 'bb'];
						for(var i = 0; i < battingCategories.length; i++) {
							var type = 'batting';
							var category = battingCategories[i];
							if(p.primary_position == 1) {
								type = 'pitching';
							}
							if(!todaysTotals[type][category]) {
								todaysTotals[type][category] = 0;
							}
									
							todaysTotals[type][category] += p.dailyStats[category];
						}
					});
					console.log(todaysTotals);
					var sortedPlayers = TEAMSORT.sortToFantasyPositions(players);

					res.render("tables/todaysStats", {
						players : sortedPlayers,
						todaysTotals : todaysTotals
					}, function(err, html) {
						res.send({ html : html });
					});
				});
			});
		});
	});

	app.get("/api/stats/activeTeam/:id", function(req, res) {
		var teamId = req.params.id;
		TEAMSTATS.updateActive(teamId, function(players) {
			players.sort(function(a, b) {
				if(a.player.primary_position <= b.player.primary_position) {
					return -1;
				} else {
					return 1;
				}
			});
			res.render("tables/activeStats", {
				players : players
			}, function(err, html) {
				res.send({ html : html });
			})
		});
	});

	app.get("/api/finances", function(req, res) {
		var team = req.query['team'];
		var year = req.query['year'];
		CASH.getFinances(team, year, function(cashByTeam) {
			res.send(cashByTeam);
		});
	});
}