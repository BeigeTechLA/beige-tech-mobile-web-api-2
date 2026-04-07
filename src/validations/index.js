const authValidation = require('./auth.validation');
const userValidation = require('./user.validation');
const leadValidation = require('./lead.validation');
const taskValidation = require('./task.validation');
const noteValidation = require('./note.validation');
const quotationValidation = require('./quotation.validation');
const faqValidation = require('./faq.validation');
const stripeValidation = require('./stripe.validation');
const airtableValidation = require('./airtable.validation');

module.exports = {
  authValidation,
  userValidation,
  leadValidation,
  taskValidation,
  noteValidation,
  quotationValidation,
  faqValidation,
  stripeValidation,
  airtableValidation,
};
