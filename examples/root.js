var root = require('root');
var github = require('github-auth');
var app = root();
 
var gh = github('blah', 'blehbleh', {
  users: ['sorribas']
});
 
app.get('/login', function(req, res) {
  res.send('<a href="'+gh.loginUrl+'">Login</a>');
});
 
app.all('*', gh.authenticate);
app.all('*', function(req, res, next) {
  if (!req.github) return res.redirect('/login');
  if (!req.github.authenticated) return res.send('You shall not pass');
  next();
});
 
app.get('/', function(req, res) {
  res.send('<h2>Hello World!</h2>');
});
 
app.listen(3000);
