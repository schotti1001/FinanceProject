const axios = require("axios");
const dotenv = require("dotenv");

/* Reading global variables from config file */
dotenv.config();
const API_KEY = process.env.API_KEY;

async function lookup(tickerSymbol) {
  let url = `https://cloud.iexapis.com/stable/stock/${tickerSymbol}/quote?token=${API_KEY}`;
  let response = await axios.get(url, { timeout: 5000 });
  return response.data;
}

module.exports = {
  lookup: lookup,
  formatDate: formatDate,
}


String.prototype.isEmpty = function() {
    return (this.length === 0 || !this.trim());
};

function formatDate(dbDate) {
    let date = new Date(dbDate);
    let month = '' + (date.getMonth() + 1);
    let day = '' + date.getDate();
    let year = date.getFullYear();


    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}