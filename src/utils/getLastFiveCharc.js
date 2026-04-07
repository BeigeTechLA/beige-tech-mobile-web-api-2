function getLastFiveChars(param) {
  // Check if the input is a string and has at least 5 characters
  if (typeof param === "string" && param.length >= 5) {
    return param.slice(-5);
  } else {
    return "Invalid order ID";
  }
}
module.exports = getLastFiveChars;
