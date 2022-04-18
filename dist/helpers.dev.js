"use strict";

var axios = require("axios");

var dotenv = require("dotenv");
/* Reading global variables from config file */


dotenv.config();
var API_KEY = process.env.API_KEY;

function lookup(tickerSymbol) {
  var url, response;
  return regeneratorRuntime.async(function lookup$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          url = "https://cloud.iexapis.com/stable/stock/".concat(tickerSymbol, "/quote?token=").concat(API_KEY);
          _context.next = 3;
          return regeneratorRuntime.awrap(axios.get(url, {
            timeout: 5000
          }));

        case 3:
          response = _context.sent;
          return _context.abrupt("return", response.data);

        case 5:
        case "end":
          return _context.stop();
      }
    }
  });
}

module.exports = {
  lookup: lookup,
  formatDate: formatDate
};

String.prototype.isEmpty = function () {
  return this.length === 0 || !this.trim();
};

function formatDate(dbDate) {
  var date = new Date(dbDate);
  var month = '' + (date.getMonth() + 1);
  var day = '' + date.getDate();
  var year = date.getFullYear();
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  return [year, month, day].join('-');
}