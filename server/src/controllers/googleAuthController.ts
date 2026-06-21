import { Request, Response } from 'express';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar',
];

export const googleAuth = (req: Request, res: Response) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // always return refresh_token
  });

  return res.redirect(authUrl);
};

export const googleCallback = async (req: Request, res: Response) => {
  const { code, error } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  if (error || !code) {
    return res.redirect(`${clientUrl}/?error=access_denied`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // Fetch the user's Google profile
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: googleUser } = await oauth2.userinfo.get();

    if (!googleUser.email || !googleUser.id) {
      return res.redirect(`${clientUrl}/?error=missing_profile`);
    }

    let user = await User.findOne({ email: googleUser.email.toLowerCase() });

    if (user) {
      // Existing user — link Google account and update tokens
      user.googleId = googleUser.id;
      user.googleAccessToken = tokens.access_token ?? undefined;
      if (tokens.refresh_token) {
        user.googleRefreshToken = tokens.refresh_token;
      }
      if (!user.name && googleUser.name) {
        user.name = googleUser.name;
      }
      await user.save();
    } else {
      // New user — create record with Google credentials
      user = new User({
        email: googleUser.email.toLowerCase(),
        name: googleUser.name ?? undefined,
        googleId: googleUser.id,
        googleAccessToken: tokens.access_token ?? undefined,
        googleRefreshToken: tokens.refresh_token ?? undefined,
      });
      await user.save();
    }

    const appToken = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.redirect(`${clientUrl}/?token=${appToken}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return res.redirect(`${clientUrl}/?error=server_error`);
  }
};
