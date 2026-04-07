const express = require('express');
const {paymentService} = require('../../services');
const { dbTestController } = require('../../controllers');
const auth = require('../../middlewares/auth');

const router = express.Router()

router.route('/').get((req, res) => {
        res.send('Hello test!')
    }
)

router.route('/payment').post(async (req, res) => {

    const intentConfig = {
        amount: 1000.00,
        currency: "USD",
        description: "Test purchase payment 1",
        metadata: {
            order_id: "6457"
        }
    };

    const payment = await paymentService.createPaymentIntent(intentConfig);

    res.json(payment);

});



router.route('/payment/:id').get(async (req, res) => {

    const payment = await paymentService.getPaymentData(req.params.id);

    res.json(payment);

});

router.route('/payment/intent/:id').get(async (req, res) => {

    const paymentIntent = await paymentService.getPaymentIntentData(req.params.id);

    res.json(paymentIntent);

});

router.route('/payment').patch(async (req, res) => {

    const paymentId = '649143ab624aaf51be49873a';

    const updateObject = {
        amount: 250,
        currency: "USD",
        description: "Updated description 2"
    };

    const updatedPayment = await paymentService.updatePaymentData(paymentId, updateObject);

    res.json(updatedPayment);

});

router.route('/set/').get((req, res) => {
        res.send('Hello seeett!')
    }
)

router
  .route('/db')
  .get(dbTestController.getDbTestEntries)
  .post(dbTestController.createDbTestEntry);

// Token validation test routes
router.route('/auth/public').get((req, res) => {
    res.json({
        success: true,
        message: 'Public route - no auth required',
        timestamp: new Date().toISOString()
    });
});

router.route('/auth/protected').get(auth(), (req, res) => {
    res.json({
        success: true,
        message: 'Protected route - token is valid',
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            isEmailVerified: req.user.isEmailVerified
        },
        timestamp: new Date().toISOString()
    });
});

router.route('/auth/admin-only').get(auth('manageUsers'), (req, res) => {
    res.json({
        success: true,
        message: 'Admin only route - you have admin privileges',
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        },
        timestamp: new Date().toISOString()
    });
});

router.route('/auth/user-info').get(auth(), (req, res) => {
    res.json({
        success: true,
        message: 'Your user information',
        user: req.user,
        headers: {
            authorization: req.headers.authorization ? 'Present' : 'Missing',
            userAgent: req.headers['user-agent']
        },
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
