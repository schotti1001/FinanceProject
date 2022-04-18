"use strict";

var express = require("express");

var session = require("express-session");

var dotenv = require("dotenv");

var helpers = require("./helpers");

var pg = require("pg");

var bodyParser = require("body-parser");

var _require = require("pug"),
    render = _require.render;
/* Reading global variables from config file */


dotenv.config();
var PORT = process.env.PORT;
var conString = process.env.DB_CON_STRING;

if (conString == undefined) {
  console.log("ERROR: environment variable DB_CON_STRING not set.");
  process.exit(1);
}

var dbConfig = {
  connectionString: conString,
  ssl: {
    rejectUnauthorized: false
  }
};
var dbClient = new pg.Client(dbConfig);
dbClient.connect();
var app = express();
var urlencodedParser = bodyParser.urlencoded({
  extended: false
});
app.use(session({
  secret: "This is a secret!",
  cookie: {
    maxAge: 3600000
  },
  resave: true,
  saveUninitialized: true
})); //turn on serving static files (required for delivering css to client)

app.use(express["static"]("public")); //configure template engine

app.set("views", "views");
app.set("view engine", "pug");
app.get('/', function (req, res) {
  redirectBySignedInStatus("index", res, req);
});
app.get('/index', function (req, res) {
  dbClient.query("SELECT symbol, name, SUM(count) FROM transactions WHERE account_id = $1 GROUP BY symbol, name HAVING SUM ( count ) > 0", [req.session.userId], function _callee(dbError, dbResponse) {
    var stocks, totalValue, i, stock, stockValue, total, data;
    return regeneratorRuntime.async(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            if (!dbError) {
              _context.next = 2;
              break;
            }

            throw error;

          case 2:
            stocks = [];
            totalValue = 0;
            i = 0;

          case 5:
            if (!(i < dbResponse.rows.length)) {
              _context.next = 24;
              break;
            }

            stock = dbResponse.rows[i];
            stockValue = void 0;
            _context.prev = 8;
            _context.next = 11;
            return regeneratorRuntime.awrap(helpers.lookup(stock.symbol));

          case 11:
            stockValue = _context.sent.latestPrice.toFixed(2);
            _context.next = 17;
            break;

          case 14:
            _context.prev = 14;
            _context.t0 = _context["catch"](8);
            res.status(400).render("error", {
              error: "Fehler beim Abfragen des Aktienkurses"
            });

          case 17:
            total = stock.sum * stockValue;
            data = {
              'symbol': stock.symbol,
              'count': stock.sum,
              'name': stock.name,
              'price': stockValue,
              'total': total
            };
            stocks.push(data);
            totalValue += total;

          case 21:
            i++;
            _context.next = 5;
            break;

          case 24:
            dbClient.query("SELECT cash FROM users WHERE id = $1", [req.session.userId], function (dbError, dbResponse) {
              if (dbResponse.rows.length != 1) {
                res.render("error", {
                  error: "Fehler beim abfragen des User Gelds."
                });
              } else {
                var cash = dbResponse.rows[0].cash;
                totalValue += cash;
                var additionalData = {
                  user: req.session.user,
                  stocks: stocks,
                  total: totalValue,
                  cash: cash
                };
                redirectBySignedInStatus("index", res, req, additionalData);
              }
            });

          case 25:
          case "end":
            return _context.stop();
        }
      }
    }, null, null, [[8, 14]]);
  });
});
app.get('/login', function (req, res) {
  res.render("login");
});
app.get('/logout', function (req, res) {
  redirectBySignedInStatus("logout", res);
});
app.get('/register', function (req, res) {
  res.render("register");
});
app.get('/quote', function (req, res) {
  redirectBySignedInStatus("quote", res);
});
app.get('/buy', function (req, res) {
  redirectBySignedInStatus("buy", res);
});
app.get('/sell', function (req, res) {
  redirectBySignedInStatus("sell", res);
});
app.get('/history', function (req, res) {
  redirectBySignedInStatus("history", res);
});
app.post("/login", urlencodedParser, function (req, res) {
  var username = req.body.username;
  var password = req.body.password;

  if (password.isEmpty() || username.isEmpty()) {
    res.render("error", {
      error: "Bitte fülle alle Felder aus."
    });
    return;
  }

  dbClient.query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password], function (dbError, dbResponse) {
    if (dbResponse.rows.length == 0) {
      res.render("error", {
        error: "Ungültiger Nutzer."
      });
    } else {
      req.session.user = username;
      req.session.userId = dbResponse.rows[0].id;
      res.redirect("index");
    }
  });
});
app.post('/register', urlencodedParser, function (req, res) {
  var username = req.body.username;
  var password = req.body.password;
  var confirmation = req.body.confirmation;

  if (password.isEmpty() || confirmation.isEmpty() || username.isEmpty()) {
    res.render("error", {
      error: "Bitte fülle alle Felder aus."
    });
    return;
  }

  if (confirmation !== password) {
    res.render("error", {
      error: "Passwörter stimmen nicht überein"
    });
    return;
  }

  getUserDataFromDB(username, function (dbError, dbResponse) {
    if (dbResponse.rows.length == 0) {
      // Create account
      dbClient.query("INSERT INTO users(username, password, cash) values ($1, $2, 10000); ", [username, password], function (dbError, dbResponse) {
        res.render("login");
      });
      return;
    } else {
      res.status(400).render("error", {
        error: "Sorry , Nutzername existiert bereits."
      });
      return;
    }
  });
});
app.post("/logout", urlencodedParser, function (req, res) {
  req.session.destroy(function (err) {
    console.log("Session destroyed.");
  });
  redirectBySignedInStatus("login", res);
});
app.post("/quote", urlencodedParser, function _callee2(req, res) {
  var requestedStock, stockValue;
  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          requestedStock = req.body.symbol;
          _context2.prev = 1;
          _context2.next = 4;
          return regeneratorRuntime.awrap(helpers.lookup(requestedStock));

        case 4:
          stockValue = _context2.sent.latestPrice.toFixed(2);
          _context2.next = 11;
          break;

        case 7:
          _context2.prev = 7;
          _context2.t0 = _context2["catch"](1);
          res.status(400).render("error", {
            error: "Fehler beim Abfragen des Aktienkurses"
          });
          return _context2.abrupt("return");

        case 11:
          redirectBySignedInStatus("quote", res, {
            result: {
              name: requestedStock,
              value: stockValue
            },
            user: req.session.user
          });

        case 12:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[1, 7]]);
});
app.post("/buy", urlencodedParser, function _callee3(req, res) {
  var requestedStock, quantity, stockValue, stockCompanyName, stock, buyStock;
  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          buyStock = function _ref(newCash) {
            dbClient.query("Update users set cash = $1 where id = $2", [newCash, req.session.userId], function (dbError, dbResponse) {
              // @Hr. Heckner: Current timestamp wird automatisch in DB gesetzt 
              dbClient.query("insert into transactions(symbol, count , price, account_id, name) values ($1, $2, $3, $4, $5)", [requestedStock, quantity, stockValue, req.session.userId, stockCompanyName], function (dbError, dbResponse) {
                redirectBySignedInStatus("index", res, {
                  user: req.session.user
                });
              });
            });
          };

          requestedStock = req.body.symbol;
          quantity = req.body.shares;

          if (!(requestedStock.isEmpty() || quantity.isEmpty())) {
            _context3.next = 6;
            break;
          }

          res.render("error", {
            error: "Bitte fülle alle Felder aus."
          });
          return _context3.abrupt("return");

        case 6:
          if (!(quantity <= 0)) {
            _context3.next = 9;
            break;
          }

          res.render("error", {
            error: "Du kannst nur eine positive Anzahl kaufen."
          });
          return _context3.abrupt("return");

        case 9:
          _context3.prev = 9;
          _context3.next = 12;
          return regeneratorRuntime.awrap(helpers.lookup(requestedStock));

        case 12:
          stock = _context3.sent;
          stockValue = stock.latestPrice.toFixed(2);
          stockCompanyName = stock.companyName;
          _context3.next = 21;
          break;

        case 17:
          _context3.prev = 17;
          _context3.t0 = _context3["catch"](9);
          res.render("error", {
            error: "Ungültiges Tickersymbol"
          });
          return _context3.abrupt("return");

        case 21:
          // Buy this stock
          getUserDataFromDB(user, function (dbResponse, dbError) {
            var cash = dbResponse.rows[0].cash;
            console.log("userCash" + cash);
            var totalPrice = quantity * stockValue;

            if (cash >= totalPrice) {
              var newCash = cash - totalPrice;
              buyStock(newCash);
            } else {
              res.render("error", {
                error: "Zu wenig Geld verfügbar"
              });
              return;
            }
          });

        case 22:
        case "end":
          return _context3.stop();
      }
    }
  }, null, null, [[9, 17]]);
});

function redirectBySignedInStatus(requestedRoute, res, req, additionalData) {
  if (checkSignIn()) {
    res.render(requestedRoute, additionalData);
  } else {
    res.render("error", {
      error: "You need to be logged in to access this page."
    });
  }
}

function checkSignIn(req) {
  if (req.session.user != undefined) {
    return true;
  }

  return false;
}

function getUserDataFromDB(username, handlerFunction) {
  dbClient.query("SELECT * FROM users WHERE id = $1", [req.session.userId], function (dbError, dbResponse) {
    return handlerFunction(dbError, dbResponse);
  });
}

app.listen(PORT, function () {
  console.log("MI Finance running and listening on port ".concat(PORT));
});