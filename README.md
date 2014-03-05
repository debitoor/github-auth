# github-auth

A middleware for github authentication.

## Installation

You can install this module with npm

```
npm install github-auth
```

## Usage

You can use the middleware on a connect/express app like this.

```js
var githubAuth = require('github-auth');

var config = {
	team: 'some-team',
	organization: 'my-company',
	autologin: true // This automatically redirects you to github to login.
};
var gh = githubAuth('github app id', 'github app secret', config);
app.use(gh.authenticate);
```
That will validate that the user belongs to the 'some-team' team of the 'my-company' organization on github.

You can also use a whitelist of users, like this.
```js
var githubAuth = require('github-auth');

var config = {
	users: ['sorribas', 'mafintosh', 'octocat']
};
var gh = githubAuth('github app id', 'github app secret', config);
app.use(gh.authenticate);
```

The authenticate middleware sets the `req.github` property to an object which contains
`user` and `authenticated`. That way you can decide what to do with unauthenticated users
(redeirect them to the login page for example). If the `req.github` object is not present
it means that the user has not tried to login, so you should redirect them to the github
login page which is on `gh.loginUrl`

You can also use the `.login` middleware which redirects you to the github oauth login page.

```js
app.get('ghlohin', gh.login);
```

To get the users in a team with the github API you need the full write access on the user
profile, which is not really nice. You can avoid this by passing some github credentials 
with access to the team to the module so it uses basic HTTP auth.

```js
var githubAuth = require('github-auth');

var config = {
	team: 'some-team',
	organization: 'my-company',
	credentials: {
		user: 'myghuser',
		pass: 'mypass'
	}
};
app.use(githubAuth('github app id', 'github app secret', config).authenticate);

```

Also, you don't have to use this module with connect or express. You could just use it in your
regular node http server like this.

```js

http.createServer(function(request, response) {
	var config = {
		team: 'some-team',
		organization: 'my-company'
	};
	githubAuth('github app id', 'github app secret', config).authenticate(request, response, function(err) {
		if(!err) return response.end(err);

		// your http code here
	});
});

```

## Configuration

 - `maxAge`: Sets the maxAge of the authentication cookie (milliseconds). Defaults to set a session cookie.
 - `secret`: The module uses a random secret to sign the authentication cookie. If you want to manage this yourself you can do it by providing it as part of the config.


# Examples

There is an example in the examples folder using Express 3. To run it you need to install express 3.x and 
github-auth.
