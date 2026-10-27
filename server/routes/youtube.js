import { Router } from 'express';
import fs from 'node:fs';
import { google } from 'googleapis';
import { requireYouTubeAuth } from '../middleware/auth.middleware.js';
import { generateYouTubeMetadata } from '../services/metadata.js';
import { getAuthedYouTubeClient } from '../services/oauth.js';
import { recordVideo } from '../services/videoHistory.js';

const router = Router();

function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

router.post('/publish', requireYouTubeAuth, async (req, res, next) => {
  try {
    const { jobId, privacyStatus = 'public', title, description, scheduledFor } = req.body || {};
    const isScheduled = !!scheduledFor;

    // Validate scheduled time
    if (isScheduled) {
      const scheduledDate = new Date(scheduledFor);
      const now = new Date();
      if (scheduledDate <= now) {
        return res.status(400).json({
          error: 'Scheduled time must be in the future. Past times publish immediately, which defeats the purpose of scheduling.',
          code: 'INVALID_SCHEDULE_TIME',
        });
      }
      // Sanity cap: don't allow scheduling more than 6 months out
      const sixMonthsOut = new Date();
      sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
      if (scheduledDate > sixMonthsOut) {
        return res.status(400).json({
          error: 'Scheduled time is too far in the future. Please choose a date within 6 months.',
          code: 'SCHEDULE_TOO_FAR',
        });
      }
    }

    const channel = req.jobHub.get(jobId);
    if (!channel) {
      return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
    }
    if (channel.state.status !== 'complete' && channel.state.status !== 'ready') {
      return res.status(409).json({ error: 'Video is not ready for publishing', code: 'VIDEO_NOT_READY' });
    }

    const beatData = channel.state.beatData || {};
    const metadata = generateYouTubeMetadata(beatData);
    const { youtube } = await getAuthedYouTubeClient(req.session);

    channel.publish('progress', { status: 'uploading', progress: 1 });

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: title || metadata.title,
          description: description || metadata.description,
          tags: metadata.hiddenTags,
          categoryId: '10',
          defaultLanguage: 'en'
        },
        status: isScheduled
          ? {
              privacyStatus: 'private',
              publishAt: new Date(scheduledFor).toISOString(),
              selfDeclaredMadeForKids: false,
            }
          : {
              privacyStatus,
              selfDeclaredMadeForKids: false,
            },
      },
      media: {
        body: fs.createReadStream(channel.state.outputPath)
      }
    }, {
      onUploadProgress: (event) => {
        const total = event.total || 1;
        const progress = Math.max(1, Math.min(99, Math.round((event.bytesRead / total) * 100)));
        channel.publish('progress', { status: 'uploading', progress });
      }
    });

    const videoId = response.data.id;
    
    // Record video to history
    recordVideo({
      videoId,
      title: title || metadata.title,
      artistA: beatData.artistA,
      artistB: beatData.artistB,
      genres: beatData.genres,
      status: isScheduled ? 'scheduled' : 'published',
      publishedAt: isScheduled ? null : new Date().toISOString(),
      scheduledFor: isScheduled ? new Date(scheduledFor).toISOString() : null,
    });

    const result = {
      videoId,
      url: `https://youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      title: title || metadata.title,
      tags: metadata.hiddenTags,
      hashtags: metadata.hashtags,
      scheduledFor: isScheduled ? scheduledFor : null,
    };

    channel.publish('complete', { status: 'published', progress: 100, result });

    safeUnlink(channel.state.audioPath);
    safeUnlink(channel.state.outputPath);
    safeUnlink(channel.state.thumbnailPath);
    req.jobHub.delete(jobId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
