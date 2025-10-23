import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grow,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Alert
} from '@mui/material';
import { CheckCircle, Close } from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { useAuth } from '../auth/useAuth';
import { createUserProfile } from '../services/userService';

const AnimatedPaper = styled(({ in: inProp, children, ...props }) => (
  <Grow in={inProp} timeout={500}>
    <Paper {...props}>{children}</Paper>
  </Grow>
))``;

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('basic');
  const [profileImage, setProfileImage] = useState(null);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // --- Validation helpers ---
  const trimmedEmail        = email.trim().toLowerCase();
  const trimmedConfirmEmail = confirmEmail.trim().toLowerCase();
  const emailsMatch         = trimmedEmail === trimmedConfirmEmail;

  const hasDigit       = /\d/.test(password);
  const hasSpecial     = /[^A-Za-z0-9]/.test(password);
  const hasMinLength   = password.length >= 8;
  const startsUpper    = /^[A-Z]/.test(password); // align with caption: "First character uppercase"
  const passwordsMatch = password === confirmPassword;
  const passwordValid  = startsUpper && hasDigit && hasSpecial && hasMinLength;

  const formValid =
    firstName.trim() &&
    lastName.trim() &&
    emailsMatch &&
    passwordsMatch &&
    passwordValid &&
    acceptedPolicy;

  // --- File guard (1 MB, image types) ---
  const handleImageChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const allowed = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowed.includes(f.type)) {
      setError('Invalid file type. Allowed: JPG, PNG, GIF.');
      return;
    }
    if (f.size > 1000 * 1024) {
      setError('File too large. Max 1MB.');
      return;
    }
    setError('');
    setProfileImage(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formValid || loading) return;

    setLoading(true);
    setError('');

    try {
      // 1) Create auth user
      const { user } = await register(trimmedEmail, password);

      // 2) Create Firestore profile (image upload inside service)
      await createUserProfile(user.uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: trimmedEmail,
        // Important: UI lets you pick, but enforce "basic" in backend rules / admin flow.
        role,
        profileImageFile: profileImage
      });

      navigate('/');
    } catch (err) {
      console.error('Error registering user:', err);
      // Common Firebase Auth messages are fine to show; otherwise generic fallback
      const message = err?.message || 'Registration failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <AnimatedPaper
        in={true}
        elevation={8}
        sx={{
          width: '100%',
          maxWidth: 600,
          mx: 'auto',
          p: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          borderRadius: 2
        }}
      >
        <Typography variant="h6" gutterBottom>
          Register Employee
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="First Name"
              fullWidth
              variant="filled"
              size="small"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              InputProps={{ disableUnderline: true }}
              sx={{ bgcolor: 'grey.100', borderRadius: 1 }}
              required
            />
            <TextField
              label="Last Name"
              fullWidth
              variant="filled"
              size="small"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              InputProps={{ disableUnderline: true }}
              sx={{ bgcolor: 'grey.100', borderRadius: 1 }}
              required
            />
          </Stack>

          <Box sx={{ position: 'relative', mb: 2 }}>
            <TextField
              label="E-mail Address"
              fullWidth
              variant="filled"
              size="small"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              InputProps={{ disableUnderline: true }}
              sx={{ bgcolor: 'grey.100', borderRadius: 1 }}
              required
            />
          </Box>

          <Box sx={{ position: 'relative', mb: 2 }}>
            <TextField
              label="Confirm E-mail Address"
              fullWidth
              variant="filled"
              size="small"
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              InputProps={{ disableUnderline: true }}
              sx={{ bgcolor: 'grey.100', borderRadius: 1 }}
              required
              error={!!confirmEmail && !emailsMatch}
              helperText={!!confirmEmail && !emailsMatch ? 'E-mails do not match' : ' '}
            />
            {emailsMatch && confirmEmail && (
              <CheckCircle
                color="success"
                sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
              />
            )}
          </Box>

          <TextField
            label="Password"
            fullWidth
            variant="filled"
            size="small"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{ disableUnderline: true }}
            sx={{ mb: 1, bgcolor: 'grey.100', borderRadius: 1 }}
            required
          />

          <Stack spacing={0.5} sx={{ mb: 2, pl: 1 }}>
            <Typography variant="caption" color={hasMinLength ? 'success.main' : 'text.secondary'}>
              • At least 8 characters
            </Typography>
            <Typography variant="caption" color={startsUpper ? 'success.main' : 'text.secondary'}>
              • First character uppercase
            </Typography>
            <Typography variant="caption" color={hasDigit ? 'success.main' : 'text.secondary'}>
              • Contains a number
            </Typography>
            <Typography variant="caption" color={hasSpecial ? 'success.main' : 'text.secondary'}>
              • Contains a special symbol
            </Typography>
          </Stack>

          <TextField
            label="Confirm Password"
            fullWidth
            variant="filled"
            size="small"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            InputProps={{ disableUnderline: true }}
            sx={{ mb: 2, bgcolor: 'grey.100', borderRadius: 1 }}
            required
            error={!!confirmPassword && !passwordsMatch}
            helperText={!!confirmPassword && !passwordsMatch ? 'Passwords do not match' : ' '}
          />

          <FormControl fullWidth sx={{ mb: 2 }} size="small">
            <InputLabel id="role-label">Role</InputLabel>
            <Select
              labelId="role-label"
              value={role}
              label="Role"
              onChange={(e) => setRole(e.target.value)}
            >
              <MenuItem value="basic">Basic</MenuItem>
              <MenuItem value="editor">Editor</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Profile Picture
            </Typography>
            <Button variant="outlined" component="label" sx={{ mb: 1 }}>
              Choose File
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.gif"
                hidden
                onChange={handleImageChange}
              />
            </Button>
            <Typography variant="caption" color="text.secondary" display="block">
              Maximum upload file size: 1000KB. Allowed Files: jpg, jpeg, png, gif
            </Typography>

            {profileImage && (
              <Box sx={{ position: 'relative', mt: 1, width: 100, height: 100 }}>
                <Box
                  component="img"
                  src={URL.createObjectURL(profileImage)}
                  alt="Preview"
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                />
                <Close
                  onClick={() => setProfileImage(null)}
                  sx={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    bgcolor: 'background.paper',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    boxShadow: 1,
                    p: 0.5
                  }}
                />
              </Box>
            )}
          </Box>

          <Stack direction="row" alignItems="center" sx={{ mb: 3 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={acceptedPolicy}
                  onChange={(e) => setAcceptedPolicy(e.target.checked)}
                />
              }
              label="I accept the internal policies"
            />
          </Stack>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={!formValid || loading}
            sx={{
              textTransform: 'none',
              py: 1.5,
              transition: 'transform 200ms',
              '&:hover': { transform: 'scale(1.02)' }
            }}
          >
            {loading ? 'Creating…' : 'Create Employee'}
          </Button>
        </Box>
      </AnimatedPaper>
    </Box>
  );
}