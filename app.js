const express = require("express");
var session = require("express-session");
const dotenv = require("dotenv");
const helpers = require("./helpers");
var pg = require("pg");

var bodyParser = require("body-parser");
const { render } = require("pug");

/* Reading global variables from config file */
dotenv.config();
const PORT = process.env.PORT;

const conString = process.env.DB_CON_STRING;

if (conString == undefined) {
    console.log("ERROR: environment variable DB_CON_STRING not set.");
    process.exit(1);
}

const dbConfig = {
  connectionString: conString,
  ssl: { rejectUnauthorized: false }
}

var dbClient = new pg.Client(dbConfig);
dbClient.connect();


var app = express();

var urlencodedParser = bodyParser.urlencoded({ extended: false });

app.use(session({
    secret: "This is a secret!",
    cookie: { maxAge: 3600000 },
    resave: true,
    saveUninitialized: true
}));

//turn on serving static files (required for delivering css to client)
app.use(express.static("public"));
//configure template engine
app.set("views", "views");
app.set("view engine", "pug");

app.get('/',  (req, res) => {
    res.redirect("index");
});

app.get('/index',   function(req, res) {
    if(checkSignIn(req)){
        showIndexPage(req, res);
    }else{
        res.render("login");
    }
});

app.get('/login', function(req, res) {
    res.render("login");
});

app.get('/logout', function(req, res) {
    redirectBySignedInStatus("logout", res, req);
});

app.get('/register', function(req, res, req) {
    res.render("register");
});

app.get('/quote', function(req, res) {
    redirectBySignedInStatus("quote", res, req);
});

app.get('/buy', function(req, res) {
    redirectBySignedInStatus("buy", res, req);
});

app.get('/sell', function(req, res) {
    dbClient.query("SELECT symbol FROM transactions WHERE account_id = $1 GROUP BY symbol, name HAVING SUM ( count ) > 0", [req.session.userId], (dbError, dbResponse) => {
        if (dbError) throw error;

        let stocks = [];
        for (let i = 0; i < dbResponse.rows.length; i++) {
            let stock = dbResponse.rows[i];

            stocks.push(stock.symbol);
        }
        redirectBySignedInStatus("sell", res, req, {stocks: stocks} );
    });
});

app.get('/history', function(req, res) {
    dbClient.query("SELECT * FROM transactions where account_id = $1 order by created_at desc", [req.session.userId], (dbError, dbResponse) => {
        if (dbError) throw error;

        let stocks = [];
        for (let i = 0; i < dbResponse.rows.length; i++) {
            let stock = dbResponse.rows[i];

            let data = {
                'symbol': stock.symbol,
                'count': stock.count,
                'name': stock.name,
                'price': stock.price,
                'date': helpers.formatDate(stock.created_at),
            }
            stocks.push(data);
        }
        redirectBySignedInStatus("history", res, req, {stocks: stocks} );
    });

});

app.post("/login", urlencodedParser, function(req, res) {
    let username = req.body.username;
    let password = req.body.password;

    if(password.isEmpty() ||  username.isEmpty()){
        showError(res, req, "Bitte fülle alle Felder aus.");
        return;
    }

    dbClient.query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password], function(dbError, dbResponse){
        if (dbResponse.rows.length == 0) {
            showError(res, req, "Ungültiger Nutzer.");
            return;
        }else{
            req.session.user = username;
            req.session.userId = dbResponse.rows[0].id;
            
            return res.redirect("index");
        }
    });
});

app.post('/register', urlencodedParser, function(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    let confirmation = req.body.confirmation;

    if(password.isEmpty() || confirmation.isEmpty() || username.isEmpty()){
        res.status(400).render("error", {error: "Bitte fülle alle Felder aus."});
        return;
    }

    if(confirmation !== password){
        res.status(400).render("error", {error: "Passwörter stimmen nicht überein"});
        return;
    }

    dbClient.query("SELECT * FROM users WHERE username = $1", [username], function(dbError, dbResponse){
        if (dbResponse.rows.length == 0) {
            // Create account
            dbClient.query("INSERT INTO users(username, password, cash) values ($1, $2, 10000); ", [username, password], function(dbError, dbResponse){
                res.render("login");
            });
            return;
        }else{
            res.status(400).render("error", {error : "Nutzername existiert bereits."});
            return;
        }
    });
});


app.post("/logout", urlencodedParser, function(req, res) {
    req.session.destroy(function (err) {
        console.log("Session destroyed.");
    });
    res.render("login");
});

app.post("/quote", urlencodedParser, async(req, res) => {
    let requestedStock = req.body.symbol;

    let stockValue;
    let companyName;
    try{
        let requestedData = await helpers.lookup(requestedStock);
        stockValue = requestedData.latestPrice.toFixed(2);
        companyName = requestedData.companyName;
    }catch(err){
        showError(res, req, "Fehler beim Abfragen des Aktienkurses");
        return;
    }

    redirectBySignedInStatus("quote", res, req, {result: {name: requestedStock, value: stockValue, companyName: companyName}, user: req.session.user});
});

app.post("/buy", urlencodedParser, async(req, res) => {
    let requestedStock = req.body.symbol;
    let quantity = req.body.shares;

    if(requestedStock.isEmpty() || quantity.isEmpty()){
        showError(res, req, "Bitte fülle alle Felder aus.");
        return;
    }

    if(isNaN(quantity)  || parseInt(Number(quantity)) != quantity){
        showError(res, req, "Bitte gib bei der Anzahl eine Ganzzahl an.");
        return;
    }

    if(quantity<=0){
        showError(res, req, "Du kannst nur eine positive Anzahl kaufen.");
        return;
    }

    let stock;
    try{
        stock = await helpers.lookup(requestedStock);
    }catch(err){
        showError(res, req, "Ungültiges Tickersymbol");
        return;
    }

    let stockValue = stock.latestPrice.toFixed(2);
    let stockCompanyName = stock.companyName;
    let symbol = stock.symbol;

    // Buy this stock
    dbClient.query("SELECT * FROM users WHERE id = $1", [req.session.userId], function(dbError, dbResponse){
        if(dbError){
            // console.log("error while requesting user data" + dbError);
            return;
        }
        let cash = parseFloat(dbResponse.rows[0].cash).toFixed(2);
        let totalPrice = quantity * stockValue;
        if(cash >= totalPrice){
            let newCash = cash - totalPrice;
            buyStock(newCash);
        }else{
            showError(res, req, "Zu wenig Geld verfügbar");
            return;
        }
    });

    function buyStock(newCash){
        dbClient.query("Update users set cash = $1 where id = $2", [newCash, req.session.userId], function(dbError, dbResponse){
            if(dbError){
                // console.log("error buying stocks"  + dbError);
                return;
            }
            
            // @Hr. Heckner: created_at wird automatisch in DB gesetzt 
            dbClient.query("insert into transactions(symbol, count , price, account_id, name) values ($1, $2, $3, $4, $5)",
             [symbol, quantity, stockValue, req.session.userId, stockCompanyName], function(dbError, dbResponse){
                res.redirect("index");
            });
        });
    }
});

app.post("/sell", urlencodedParser, async function(req, res) {
    let stockToSell = req.body.symbol;
    let quantity = req.body.shares;

    if(stockToSell.isEmpty() || quantity.isEmpty()){
        showError(res, req, "Bitte fülle alle Felder aus.");
        return;
    }

    if(quantity<=0){
        showError(res, req, "Du kannst nur eine positive Anzahl verkaufen.");
        return;
    }


     dbClient.query("SELECT sum(count) FROM transactions WHERE account_id = $1 GROUP BY symbol, name HAVING SUM ( count ) > 0 and symbol = $2", [req.session.userId, stockToSell], async (dbError, dbResponse) => {
        if (dbError) throw error;

        if(dbResponse.rowCount==1){
            let currentAmountStocks = dbResponse.rows[0].sum;

            if(currentAmountStocks< quantity){
                showError(res, req, "Man kann nicht mehr verkaufen als man besitzt...");
                return;
            }
        }else{
            throw error;
        }

        let stock;
        try{
            stock = await helpers.lookup(stockToSell);
        }catch(err){
            showError(res, req, "Ungültiges Tickersymbol");
            return;
        }
    
        let stockValue = stock.latestPrice;
        let stockCompanyName = stock.companyName;
    
        getUserDataFromDB(req, function (dbError, dbResponse) {
            if(dbError){
                // console.log("error while requesting user data" + dbError);
                return;
            }
            let cash = parseFloat(dbResponse.rows[0].cash);
            let totalPrice = parseFloat(quantity * stockValue);
            
            let newCash = cash + totalPrice;    
            handleTransaction(req, res, newCash, stockToSell, quantity * -1, stockValue.toFixed(2), stockCompanyName);
        });
    });
});

function handleTransaction(req, res, newCash, symbol, quantity, stockValue, companyName){
    dbClient.query("Update users set cash = $1 where id = $2", [newCash, req.session.userId], function(dbError, dbResponse){
        if(dbError){
            //console.log("error handling transactions "  + dbError);
            return;
        }
        
        // @Hr. Heckner: created_at wird automatisch in DB gesetzt 
        dbClient.query("insert into transactions(symbol, count , price, account_id, name) values ($1, $2, $3, $4, $5)",
         [symbol, quantity, stockValue, req.session.userId, companyName], function(dbError, dbResponse){
            res.redirect("index");
        });
    });
}

function getUserDataFromDB(req, handlerFunction){
    dbClient.query("SELECT * FROM users WHERE id = $1", [req.session.userId],
        (dbError, dbResponse) => handlerFunction(dbError, dbResponse));
}

function redirectBySignedInStatus(requestedRoute, res, req, additionalData){
    if(checkSignIn(req)){
        let params;
        if(additionalData == undefined)
        {
            params = { user: req.session.user};
        } else {
            params = additionalData;
            params.user = req.session.user;
        }

        res.render(requestedRoute, params);
    }else{
        showError(res, req, "Sie müssen eingeloggt sein um auf diese Seite zugreifen zu dürfen.");
        return;
    }
}

function checkSignIn(req){
    if(req != undefined && req.session != undefined && req.session.user != undefined) {  
        return true;
    }
    return false;
}

function showError(res, req, errorMessage){
    let user;
    if(req!=undefined && req.session!=undefined){
        user = req.session.user;
    }
    res.status(400).render("error", {error: errorMessage, user: user});
}

function showIndexPage(req, res){
    dbClient.query("SELECT symbol, name, SUM(count) FROM transactions WHERE account_id = $1 GROUP BY symbol, name HAVING SUM ( count ) > 0", [req.session.userId], async (dbError, dbResponse) => {
        if (dbError) throw error;

        let stocks = [];
        let totalValue = 0;
        for (let i = 0; i < dbResponse.rows.length; i++) {
            let stock = dbResponse.rows[i];

            let stockValue;
            try{
                stockValue = (await helpers.lookup(stock.symbol)).latestPrice.toFixed(2);
            }catch(err){
                showError(res, req, "");
                return;
            }

            let total = stock.sum * stockValue;
            let data = {
                'symbol': stock.symbol,
                'count': stock.sum,
                'name': stock.name,
                'price': stockValue,
                'total': total,
            }
            stocks.push(data);
            totalValue += total;
        }

        dbClient.query("SELECT cash FROM users WHERE id = $1", [req.session.userId], function(dbError, dbResponse){
            if (dbResponse.rows.length != 1 || dbError) {
                showError(res, req, "Fehler beim abfragen des User Gelds.");
                return;
            }else{
                let cash = parseFloat(dbResponse.rows[0].cash);
                totalValue = totalValue + cash;
                
                let additionalData = {stocks: stocks, total: totalValue.toFixed(2), cash: cash.toFixed(2)};
                redirectBySignedInStatus("index", res, req, additionalData);
            }
        });           
    });
}

app.listen(PORT, function() {
  console.log(`MI Finance running and listening on port ${PORT}`);
});