var User = require('../models/user');

exports.isAuthenticated = function (req, res, next){
	console.log(req.user);
	if(req.isAuthenticated()){
		next();
	}else{
		res.redirect("/login");
	}
}

exports.userExist = function(req, res, next) {
	User.count( {email: req.body.email}, function (err, count) {
		if (count === 0) {
		    next();
		} else {
		    res.redirect("/singup");
		}
	});
}

exports.isAdmin = function(req,res,next) {
	if(req.user.role === 'admin') {
		next();
	} else {
		res.redirect("/");
	}
}
