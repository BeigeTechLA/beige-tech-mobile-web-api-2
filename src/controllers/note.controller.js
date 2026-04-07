// src/controllers/note.controller.js
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { noteService } = require('../services');

const createNote = catchAsync(async (req, res) => {
  const note = await noteService.createNote(req.body);
  res.status(httpStatus.CREATED).send(note);
});

const getNotes = catchAsync(async (req, res) => {
  const filter = { leadId: req.query.leadId };
  const options = {
    sortBy: req.query.sortBy,
    limit: req.query.limit,
    page: req.query.page,
    createdBy: req.query.createdBy,
  };
  
  const result = await noteService.queryNotes(filter, options);
  const totalPages = Math.ceil(result.total / result.limit);
  res.send({
    ...result,
    totalPages,
    currentPage: result.page,
  });
});

const getNote = catchAsync(async (req, res) => {
  const note = await noteService.getNoteById(req.params.noteId);
  res.send(note);
});

const updateNote = catchAsync(async (req, res) => {
  const note = await noteService.updateNoteById(req.params.noteId, req.body);
  res.send(note);
});

const deleteNote = catchAsync(async (req, res) => {
  const note = await noteService.deleteNoteById(req.params.noteId);
  res.status(httpStatus.NO_CONTENT).send(note);
});

module.exports = {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote,
};