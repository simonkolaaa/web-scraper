import React, { useState, useEffect } from 'react';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import { useNavigate, useLocation } from 'react-router-dom';
import { Paper, Button, useTheme, Modal, Typography, Stack, Divider, Dialog, DialogContent, DialogTitle } from "@mui/material";
import { AutoAwesome, VpnKey, Usb, CloudQueue, Description, Favorite, SlowMotionVideo, PlayArrow, ArrowForwardIos, Star, Terminal } from "@mui/icons-material";
import { useTranslation } from 'react-i18next';

interface MainMenuProps {
  value: string;
  handleChangeContent: (newValue: string) => void;
}

export const MainMenu = ({ value = 'robots', handleChangeContent }: MainMenuProps) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [docModalOpen, setDocModalOpen] = useState(false);
  const handleChange = (event: React.SyntheticEvent, newValue: string) => {
    navigate(`/${newValue}`);
    handleChangeContent(newValue);
  };

  const handleRobotsClick = () => {
    if (location.pathname !== '/robots') {
      navigate('/robots');
      handleChangeContent('robots');
    }
  };

  const defaultcolor = theme.palette.mode === 'light' ? 'black' : 'white';

  const buttonStyles = {
    justifyContent: 'flex-start',
    textAlign: 'left',
    fontSize: '15px',
    letterSpacing: '0.02857em',
    padding: '20px 20px 0px 22px',
    minHeight: '60px',
    minWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    textTransform: 'none',
    color: theme.palette.mode === 'light' ? '#6C6C6C' : 'inherit',
    '&:hover': {
      color: theme.palette.mode === 'light' ? '#6C6C6C' : 'inherit',
      backgroundColor: theme.palette.mode === 'light' ? '#f5f5f5' : 'inherit',
    },
  };

  const starButtonStyles = {
    justifyContent: 'flex-start',
    textAlign: 'left',
    fontSize: '14px',
    padding: '12px 20px 12px 22px',
    minHeight: '48px',
    minWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    textTransform: 'none',
    color: theme.palette.mode === 'light' ? '#6C6C6C' : 'inherit',
    backgroundColor: theme.palette.mode === 'light' ? '#fafafa' : 'rgba(255, 255, 255, 0.04)',
    '&:hover': {
      color: theme.palette.mode === 'light' ? '#6C6C6C' : 'inherit',
      backgroundColor: theme.palette.mode === 'light' ? '#f0f0f0' : 'rgba(255, 255, 255, 0.08)',
    },
  };

  return (
    <>
      <Paper
        sx={{
          height: '100%',
          width: '230px',
          backgroundColor: theme.palette.background.paper,
          color: defaultcolor,
          display: 'flex',
          flexDirection: 'column',
        }}
        variant="outlined"
        square
      >
        <Box sx={{
          width: '100%',
          paddingBottom: '1rem',
          flexGrow: 1,
          overflowY: 'auto'
        }}>
          <Tabs
            value={value}
            onChange={handleChange}
            textColor="primary"
            indicatorColor="primary"
            orientation="vertical"
            sx={{
              alignItems: 'flex-start',
              '& .MuiTabs-indicator': { display: 'none' },
              paddingTop: '0.5rem'
            }}
          >
            <Tab
              value="robots"
              label={t('mainmenu.recordings')}
              icon={<AutoAwesome sx={{ fontSize: 20 }} />}
              iconPosition="start"
              disableRipple={true}
              sx={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: '15px' }}
              onClick={handleRobotsClick} />
            <Tab value="runs"
              label={t('mainmenu.runs')}
              icon={<PlayArrow sx={{ fontSize: 20 }} />}
              iconPosition="start"
              disableRipple={true}
              sx={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: '15px' }} />
            <Tab value="proxy"
              label={t('mainmenu.proxy')}
              icon={<Usb sx={{ fontSize: 20 }} />}
              iconPosition="start"
              disableRipple={true}
              sx={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: '15px' }} />
            <Tab value="apikey"
              label={t('mainmenu.apikey')}
              icon={<VpnKey sx={{ fontSize: 20 }} />}
              iconPosition="start"
              disableRipple={true}
              sx={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: '15px' }} />
          </Tabs>
        </Box>
      </Paper>

    </>
  );
};