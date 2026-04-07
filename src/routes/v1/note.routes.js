const express = require('express');
const validate = require('../../middlewares/validate');
const { noteValidation } = require('../../validations');
const { noteController } = require('../../controllers');

const router = express.Router();

// Note Routes
router
  .route('/')
  .post(validate(noteValidation.createNote), noteController.createNote)
  .get(validate(noteValidation.getNotes), noteController.getNotes);

router
  .route('/:noteId')
  .get(validate(noteValidation.getNote), noteController.getNote)
  .patch(validate(noteValidation.updateNote), noteController.updateNote)
  .delete(validate(noteValidation.deleteNote), noteController.deleteNote);

module.exports = router;