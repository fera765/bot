const express = require('express');
const multer = require('multer');
const path = require('path');
const videoController = require('../controllers/videoController');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

// Routes
router.post('/generate', videoController.generateVideo);
router.post('/generate-from-file', upload.single('jsonFile'), videoController.generateVideoFromFile);
router.get('/list', videoController.listVideos);
router.get('/download/:filename', videoController.downloadVideo);
router.delete('/:filename', videoController.deleteVideo);
router.get('/status/:jobId', videoController.getJobStatus);

module.exports = router;