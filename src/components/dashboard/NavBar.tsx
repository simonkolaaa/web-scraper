import { useTranslation } from "react-i18next";
import React, { useState, useContext, useEffect } from 'react';
import axios from 'axios';
import styled from "styled-components";
import { stopRecording } from "../../api/recording";
import { useGlobalInfoStore } from "../../context/globalInfo";
import {
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Chip,
  Button,
  Snackbar,
  Tooltip
} from "@mui/material";
import {
  AccountCircle,
  Logout,
  Clear,
  YouTube,
  X,
  GitHub,
  Close,
  LightMode,
  DarkMode,
  Translate
} from "@mui/icons-material";
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/auth';
import { SaveRecording } from '../recorder/SaveRecording';
import DiscordIcon from '../icons/DiscordIcon';
import { apiUrl } from '../../apiConfig';
import Logo from "../../assets/logo.png";
import { useThemeMode } from '../../context/theme-provider';
import packageJson from "../../../package.json"

interface NavBarProps {
  recordingName: string;
  isRecording: boolean;
}

export const NavBar: React.FC<NavBarProps> = ({
  recordingName,
  isRecording,
}) => {
  const { notify, browserId, setBrowserId } = useGlobalInfoStore();
  const { state, dispatch } = useContext(AuthContext);
  const { user } = state;
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useThemeMode();
  const { t, i18n } = useTranslation();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const [langAnchorEl, setLangAnchorEl] = useState<null | HTMLElement>(null);

  const currentVersion = packageJson.version;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleLangMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLangAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setLangAnchorEl(null);
  };

  const logout = async () => {
    try {
      const { data } = await axios.get(`${apiUrl}/auth/logout`);
      if (data.ok) {
        dispatch({ type: "LOGOUT" });
        window.localStorage.removeItem("user");
        // notify('success', t('navbar.notifications.success.logout'));
        navigate("/login");
      }
    } catch (error: any) {
      const status = error.response?.status;
      let errorKey = 'unknown';

      switch (status) {
        case 401:
          errorKey = 'unauthorized';
          break;
        case 500:
          errorKey = 'server';
          break;
        default:
          if (error.message?.includes('Network Error')) {
            errorKey = 'network';
          }
      }

      notify(
        'error',
        t(`navbar.notifications.errors.logout.${errorKey}`, {
          error: error.response?.data?.message || error.message
        })
      );
      navigate("/login");
    }
  };

  const goToMainMenu = async () => {
    if (browserId) {
      await stopRecording(browserId);
      notify("warning", t('browser_recording.notifications.terminated'));
      setBrowserId(null);
    }
    navigate("/");
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("language", lang);
  };

  const renderThemeToggle = () => (
    <Tooltip title="Change Mode">
      <IconButton
        onClick={toggleTheme}
        sx={{
          color: darkMode ? '#ffffff' : '#0000008A',
          '&:hover': {
            background: 'inherit'
          }
        }}
      >
        {darkMode ? <LightMode /> : <DarkMode />}
      </IconButton>
    </Tooltip>
  );

  return (
    <>
      <NavBarWrapper mode={darkMode ? 'dark' : 'light'}>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-start',
          cursor: 'pointer'
        }}
          onClick={() => navigate('/')}>
          <img src={Logo} width={48} height={40} style={{ borderRadius: '5px', margin: '5px 0px 5px 15px' }} />
          <div style={{ padding: '11px' }}><ProjectName mode={darkMode ? 'dark' : 'light'}>{t('navbar.project_name')}</ProjectName></div>
          <Chip
            label={`${currentVersion}`}
            color="primary"
            variant="outlined"
            sx={{ marginTop: '10px' }}
          />
        </div>
        {
          user ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {!isRecording ? (
                <>
                  
                  <IconButton onClick={handleMenuOpen} sx={{
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '5px',
                    padding: '8px',
                    marginRight: '10px',
                    '&:hover': {
                      background: 'inherit'
                    }
                  }}>
                    <AccountCircle sx={{ marginRight: '5px' }} />
                    <Typography variant="body1">{user.email}</Typography>
                  </IconButton>
                  <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                    anchorOrigin={{
                      vertical: 'bottom',
                      horizontal: 'center',
                    }}
                    transformOrigin={{
                      vertical: 'top',
                      horizontal: 'center',
                    }}
                    PaperProps={{ sx: { width: '180px' } }}
                  >
                    <MenuItem onClick={() => { handleMenuClose(); logout(); }}>
                      <Logout sx={{ marginRight: '5px' }} /> {t('navbar.menu_items.logout')}
                    </MenuItem>
                    <MenuItem onClick={handleLangMenuOpen}>
                      <Translate sx={{ marginRight: '5px' }} /> {t('navbar.menu_items.language')}
                    </MenuItem>
                    <hr />
                    <Menu
                      anchorEl={langAnchorEl}
                      open={Boolean(langAnchorEl)}
                      onClose={handleMenuClose}
                      anchorOrigin={{
                        vertical: "bottom",
                        horizontal: "center",
                      }}
                      transformOrigin={{
                        vertical: "top",
                        horizontal: "center",
                      }}
                    >
                      <MenuItem
                        onClick={() => {
                          changeLanguage("en");
                          handleMenuClose();
                        }}
                      >
                        English
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          changeLanguage("es");
                          handleMenuClose();
                        }}
                      >
                        Español
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          changeLanguage("ja");
                          handleMenuClose();
                        }}
                      >
                        日本語
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          changeLanguage("zh");
                          handleMenuClose();
                        }}
                      >
                        中文
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          changeLanguage("de");
                          handleMenuClose();
                        }}
                      >
                        Deutsch
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          changeLanguage("tr");
                          handleMenuClose();
                        }}
                      >
                        Türkçe
                      </MenuItem>

                    </Menu>
                  </Menu>
                  {renderThemeToggle()}
                </>
              ) : (
                <>
                  <IconButton onClick={goToMainMenu} sx={{
                    borderRadius: '5px',
                    padding: '8px',
                    background: 'red',
                    color: 'white',
                    marginRight: '10px',
                    '&:hover': { color: 'white', backgroundColor: 'red' }
                  }}>
                    <Clear sx={{ marginRight: '5px' }} />
                    {t('navbar.recording.discard')}
                  </IconButton>
                  <SaveRecording fileName={recordingName} />
                </>
              )}
            </div>
          ) : (
            <NavBarRight>
              <IconButton
                onClick={handleLangMenuOpen}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  borderRadius: "5px",
                  padding: "8px",
                  marginRight: "4px",
                }}
              >
                <Translate />
              </IconButton>
              <Menu
                anchorEl={langAnchorEl}
                open={Boolean(langAnchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "center",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "center",
                }}
              >
                <MenuItem
                  onClick={() => {
                    changeLanguage("en");
                    handleMenuClose();
                  }}
                >
                  English
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    changeLanguage("es");
                    handleMenuClose();
                  }}
                >
                  Español
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    changeLanguage("ja");
                    handleMenuClose();
                  }}
                >
                  日本語
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    changeLanguage("zh");
                    handleMenuClose();
                  }}
                >
                  中文
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    changeLanguage("de");
                    handleMenuClose();
                  }}
                >
                  Deutsch
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    changeLanguage("tr");
                    handleMenuClose();
                  }}
                >
                  Türkçe
                </MenuItem>

              </Menu>
              {renderThemeToggle()}
            </NavBarRight>
          )}
      </NavBarWrapper>
    </>
  );
};

const NavBarWrapper = styled.div<{ mode: 'light' | 'dark' }>`
  grid-area: navbar;
  background-color: ${({ mode }) => (mode === 'dark' ? '#000000ff' : '#ffffff')};
  padding: 5px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid ${({ mode }) => (mode === 'dark' ? '#000000ff' : '#e0e0e0')};
`;

const ProjectName = styled.b<{ mode: 'light' | 'dark' }>`
  color: ${({ mode }) => (mode === 'dark' ? '#ffffff' : '#3f4853')};
  font-size: 1.3em;
`;

const NavBarRight = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-left: auto;
`;
