import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertIcon from '@mui/icons-material/MoreVert';

// 1. DEFINE SPECIFIC KEYS HERE
const options = [
    { key: 'navigation', label: 'Navigation' },
    { key: 'report_theft', label: 'Report Theft' },       // Specific
    { key: 'add_rack', label: 'Add Bike Rack' },          // Specific
    { key: 'add_repair', label: 'Add Repair Station' },   // Specific
    { key: 'emergency', label: 'Emergency Contacts' },
];

const ITEM_HEIGHT = 52;

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
    setCategory(categoryKey); // 2. PASS THE SPECIFIC KEY TO APP.JS
    handleClose();
  };

  return (
    <div>
      <IconButton onClick={handleClick} sx={{ padding: 0 }}>
        {customTrigger || <MoreVertIcon sx={{ color: '#9CA3AF' }} />}
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            style: {
              maxHeight: ITEM_HEIGHT * 5,
              width: '22ch',
              backgroundColor: '#1F2937',
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
            sx={{ '&:hover': { backgroundColor: '#374151' }, fontSize: '0.9rem' }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}