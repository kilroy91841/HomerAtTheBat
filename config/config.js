var env;

exports.setUpEnv = function(_env) {
	this.env = _env;
	return this;
};

exports.config = function() {
	return envConfig[this.env];
}

exports.clone = function() {
	var cloneConfig = {};
	for(var prop in envConfig[this.env]) {
		cloneConfig[prop] = envConfig[this.env][prop];
	}
	return cloneConfig;
}

var envConfig = {
	development: {
		env: 'development',
		db: 'mongodb://localhost:27017/app18596138',
		app: {
			name: 'Homer At The Bat'
		},
		isVultureOn: false,
		isOffseason: false,
		isKeeperPeriod: false,
		year: 2015,
		nextYear: 2016,
		isTradingOn: true,
		isMILBDraftOn: false,
		isMailOn: 'ari',
		minorLeaguerInningsPitchedThreshhold: 50,
		minorLeaguerAtBatsThreshhold: 150,
		email: {
			user: "homeratthebat@gmail.com",
			pass: "fantasybaseball"
		},
		vultureTimeframe : 'minutes',
		vultureDuration : 5,
		freeAgentAuctionTimeframe : 'minutes',
		freeAgentAuctionDuration : 5,
		tradeTimeframe : 'minutes',
		tradeDuration : 5
	},
  	production: {
  		env: 'production',
		db: 'mongodb://ari:ari@paulo.mongohq.com:10004/app18596138/baseball',
		app: {
			name: 'Homer At The Bat'
		},
		isVultureOn: false,
		isOffseason: false,
		isKeeperPeriod: false,
		year: 2015,
		nextYear: 2016,
		isTradingOn: true,
		isMILBDraftOn: false,
		isMailOn: true,
		minorLeaguerInningsPitchedThreshhold: 50,
		minorLeaguerAtBatsThreshhold: 150,
		email: {
			user: "homeratthebat@gmail.com",
			pass: "fantasybaseball"
		},
		vultureTimeframe : 'hours',
		vultureDuration : 24,
		freeAgentAuctionTimeframe : 'hours',
		freeAgentAuctionDuration : 24,
		tradeTimeframe : 'days',
		tradeDuration : 3
	}
}
