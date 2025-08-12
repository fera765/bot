const fs = require('fs').promises;
const path = require('path');
const videoService = require('../services/videoService');
const { v4: uuidv4 } = require('uuid');

// Store job status in memory (in production, use Redis or database)
const jobStatus = new Map();

exports.generateVideo = async (req, res) => {
  try {
    const videoData = req.body;
    
    // Validate JSON structure
    if (!videoData.dialogues || !Array.isArray(videoData.dialogues)) {
      return res.status(400).json({ 
        error: 'Invalid JSON structure', 
        message: 'JSON must contain a dialogues array' 
      });
    }

    // Generate job ID
    const jobId = uuidv4();
    jobStatus.set(jobId, { status: 'processing', progress: 0 });

    // Start video generation in background
    videoService.generateVideo(videoData, jobId)
      .then(result => {
        jobStatus.set(jobId, { 
          status: 'completed', 
          progress: 100, 
          filename: result.filename,
          url: result.url 
        });
      })
      .catch(error => {
        console.error('Video generation error:', error);
        jobStatus.set(jobId, { 
          status: 'failed', 
          error: error.message 
        });
      });

    res.json({ 
      message: 'Video generation started', 
      jobId,
      statusUrl: `/api/videos/status/${jobId}`
    });

  } catch (error) {
    console.error('Error in generateVideo:', error);
    res.status(500).json({ error: 'Failed to generate video', message: error.message });
  }
};

exports.generateVideoFromFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read and parse JSON file
    const jsonContent = await fs.readFile(req.file.path, 'utf-8');
    const videoData = JSON.parse(jsonContent);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    // Use the same logic as generateVideo
    req.body = videoData;
    return exports.generateVideo(req, res);

  } catch (error) {
    console.error('Error in generateVideoFromFile:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    
    res.status(500).json({ error: 'Failed to process file', message: error.message });
  }
};

exports.listVideos = async (req, res) => {
  try {
    const videosDir = path.join(__dirname, '../../public/videos');
    const files = await fs.readdir(videosDir);
    
    const videos = await Promise.all(
      files
        .filter(file => file.endsWith('.mp4'))
        .map(async (file) => {
          const filePath = path.join(videosDir, file);
          const stats = await fs.stat(filePath);
          return {
            filename: file,
            size: stats.size,
            createdAt: stats.birthtime,
            url: `/videos/${file}`,
            downloadUrl: `/api/videos/download/${file}`
          };
        })
    );

    videos.sort((a, b) => b.createdAt - a.createdAt);
    
    res.json({ videos });

  } catch (error) {
    console.error('Error listing videos:', error);
    res.status(500).json({ error: 'Failed to list videos', message: error.message });
  }
};

exports.downloadVideo = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../public/videos', filename);
    
    // Check if file exists
    await fs.access(filePath);
    
    res.download(filePath, filename);

  } catch (error) {
    console.error('Error downloading video:', error);
    res.status(404).json({ error: 'Video not found' });
  }
};

exports.deleteVideo = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../public/videos', filename);
    
    await fs.unlink(filePath);
    
    res.json({ message: 'Video deleted successfully' });

  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ error: 'Failed to delete video', message: error.message });
  }
};

exports.getJobStatus = (req, res) => {
  const { jobId } = req.params;
  const status = jobStatus.get(jobId);
  
  if (!status) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(status);
};