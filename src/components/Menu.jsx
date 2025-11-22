import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertIcon from '@mui/icons-material/MoreVert';

const options = [
    { key: 'navigation', label: 'Navigation' }, // Added Navigation back to list
    { key: 'report', label: 'Report theft' },
    { key: 'racks', label: 'Add bike rack' },
    { key: 'emergency', label: 'Emergency call' },
    { key: 'repair', label: 'Add repair station' }
];

const ITEM_HEIGHT = 48;

export default function OverflowMenu({ setCategory, customTrigger }) {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleItemClick = (categoryKey) => {
    setCategory(categoryKey);
    handleClose();
  };

  return (
    <div>
      <IconButton
        aria-label="menu"
        id="long-button"
        aria-controls={open ? 'long-menu' : undefined}
        aria-expanded={open ? 'true' : undefined}
        aria-haspopup="true"
        onClick={handleClick}
        sx={{ padding: 0 }} // Remove default padding for tighter fit
      >
        {customTrigger || <MoreVertIcon sx={{ color: '#9CA3AF' }} />}
      </IconButton>
      <Menu
        id="long-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            style: {
              maxHeight: ITEM_HEIGHT * 5,
              width: '22ch',
              backgroundColor: '#1F2937', // Dark Gray (Tailwind gray-800)
              color: 'white',
              border: '1px solid #374151'
            },
          },
        }}
      >
        {options.map((option) => (
          <MenuItem 
            key={option.key} 
            onClick={() => handleItemClick(option.key)}
            sx={{
                '&:hover': { backgroundColor: '#374151' },
                fontSize: '0.9rem'
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}