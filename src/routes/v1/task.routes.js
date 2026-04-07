const express = require('express');
const validate = require('../../middlewares/validate');
const { taskValidation } = require('../../validations');
const { taskController } = require('../../controllers');

const router = express.Router();

// Task Routes
router
  .route('/')
  .post(validate(taskValidation.createTask), taskController.createTask)
  .get(validate(taskValidation.getTasks), taskController.getTasks);

router
  .route('/:taskId')
  .get(validate(taskValidation.getTask), taskController.getTask)
  .patch(validate(taskValidation.updateTask), taskController.updateTask)
  .delete(validate(taskValidation.deleteTask), taskController.deleteTask);

// Task Status Updates
router.post(
  '/:taskId/status',
  validate(taskValidation.updateTaskStatus),
  taskController.updateTaskStatus
);

// Task Assignment
router.post(
  '/:taskId/assign',
  validate(taskValidation.assignTask),
  taskController.assignTask
);

// Remove Task Assignment
router.post(
  '/:taskId/unassign',
  validate(taskValidation.assignTask), // Reusing the same validation schema
  taskController.removeTaskAssignees
);

module.exports = router;