import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';


const lightTheme = createTheme({
  palette: {
    primary: {
      main: "#ff00c3",
      contrastText: "#ffffff",
    },
  },
  components: {
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflow: 'auto',
          /* Firefox */
          scrollbarWidth: 'thin',
          scrollbarColor: 'gray transparent',

          /* WebKit (Chrome, Edge, Safari) */
          '&::-webkit-scrollbar': {
            width: '5px',
            height: '5px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'gray',
            borderRadius: '8px',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          // Default styles for all buttons (optional)
          textTransform: "none",
        },
        containedPrimary: {
          // Styles for 'contained' variant with 'primary' color
          "&:hover": {
            backgroundColor: "#ff66d9",
          },
        },
        outlined: {
          // Apply white background for all 'outlined' variant buttons
          backgroundColor: "#ffffff",
          "&:hover": {
            backgroundColor: "#f0f0f0", // Optional lighter background on hover
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          "&:hover": {
            color: "#ff00c3",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          // '&:hover': {
          //   color: "#ff66d9",
          // },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
         minHeight: 60, 
         textTransform: "none",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        outlinedInfo: {
          color: 'rgb(0, 0, 0)',
          border: 'none',
          "& .MuiAlert-icon": {
            color: "#000000",
          },
        },
        standardInfo: {
          backgroundColor: "#fce1f4",
          color: "#ff00c3",
          "& .MuiAlert-icon": {
            color: "#ff00c3",
          },
        },
      },
    },
  },
});

const darkTheme = createTheme({
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  palette: {
    mode: 'dark',
    primary: {
      main: "#00e5ff", // Neon Cyan
      contrastText: "#000000",
    },
    error: {
      main: '#f44336',
      light: '#e57373',
      dark: '#d32f2f',
      contrastText: '#ffffff',
    },
    background: {
      default: '#0b0b0e',
      paper: '#121217',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b3b3b3',
    },
  },
  components: {
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflow: 'auto',
          /* Firefox */
          scrollbarWidth: 'thin',
          scrollbarColor: 'currentColor transparent',

          /* WebKit (Chrome, Edge, Safari) */
          '&::-webkit-scrollbar': {
            width: '5px',
            height: '5px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'currentColor',
            borderRadius: '8px',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: "8px",
          fontWeight: 600,
          color: '#ffffff',
          '&.MuiButton-outlined': {
            borderColor: 'rgba(255, 255, 255, 0.2)',
            color: '#ffffff',
            "&:hover": {
              borderColor: '#00e5ff',
              backgroundColor: 'rgba(0, 229, 255, 0.08)',
            },
          },
        },
        containedPrimary: {
          "&:hover": {
            backgroundColor: "#ff66d9",
          },
        },
        outlined: {
          borderColor: '#ff00c3',
          color: '#ff00c3',
          "&:hover": {
            // backgroundColor: 'rgba(255, 0, 195, 0.08)',
            borderColor: '#ff66d9',
          },
          '&.MuiButton-outlinedError': {
            borderColor: '#f44336',
            color: '#f44336',
            "&:hover": {
              // backgroundColor: 'rgba(244, 67, 54, 0.08)',
              borderColor: '#d32f2f',
            },
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: '#ff66d9',
          "&:hover": {
            color: "#ff00c3",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: '#ffffff',
          // "&:hover": {
          //   backgroundColor: 'rgba(255, 0, 195, 0.08)',
          // },
          '&.MuiIconButton-colorError': {
            color: '#f44336',
            // "&:hover": {
            //   backgroundColor: 'rgba(244, 67, 54, 0.08)',
            // },
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 60, 
          textTransform: "none",
          color: '#ffffff',
          "&.Mui-selected": {
            color: '#ff00c3',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        outlinedInfo: {
          color: '#ffffff',
          border: 'none',
          "& .MuiAlert-icon": {
            color: "#ffffff",
          },
        },
        standardInfo: {
          backgroundColor: "#080808ff",
          color: "#ff00c3",
          "& .MuiAlert-icon": {
            color: "#ff00c3",
          },
        },
      },
    },
    // Additional dark mode specific components
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(18, 18, 23, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(11, 11, 14, 0.8)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(18, 18, 23, 0.85)',
          backdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #080808ff',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#494949ff',
        },
      },
    },
    //   MuiTextField:{
    //     styleOverrides: {
    //       root: {
    //         '& .MuiInputBase-root': {
    //           backgroundColor: '#1d1c1cff',
    //         },
    //   }
    // }}
  },
});

const ThemeModeContext = createContext({
  toggleTheme: () => { },
  darkMode: false,
});

export const useThemeMode = () => useContext(ThemeModeContext);

const ThemeModeProvider = ({ children }: { children: React.ReactNode }) => {
  // Load saved mode from localStorage or default to dark mode for Nexus
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode ? JSON.parse(savedMode) : true;
  });

  const toggleTheme = () => {
    setDarkMode((prevMode: any) => {
      const newMode = !prevMode;
      localStorage.setItem('darkMode', JSON.stringify(newMode)); // Save new mode to localStorage
      return newMode;
    });
  };

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode)); // Save initial mode
  }, [darkMode]);

  return (
    <ThemeModeContext.Provider value={{ toggleTheme, darkMode }}>
      <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
};

export default ThemeModeProvider;