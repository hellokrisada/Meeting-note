# ✈️ Flight Search App - Features

## 🎯 New Features Added

### 1. Airport Dropdown Lists
- **15 Major US Airports** available for selection
- Dropdown shows: Airport Code - City Name
- Easy selection instead of manual typing
- Prevents typos and invalid airport codes

**Available Airports:**
- JFK - New York
- LAX - Los Angeles
- ORD - Chicago
- DFW - Dallas
- DEN - Denver
- SFO - San Francisco
- SEA - Seattle
- LAS - Las Vegas
- MCO - Orlando
- MIA - Miami
- ATL - Atlanta
- BOS - Boston
- PHX - Phoenix
- IAH - Houston
- MSP - Minneapolis

### 2. Direct Booking Links
- Each flight card now has a "Book on [Airline]" button
- Clicking opens the airline's official website in a new tab
- Pre-filled with flight details (from, to, date)
- Direct access to:
  - United Airlines (united.com)
  - Delta Airlines (delta.com)
  - American Airlines (aa.com)
  - Southwest Airlines (southwest.com)
  - JetBlue Airways (jetblue.com)

### 3. Enhanced UI
- Airline codes displayed (UA, DL, AA, WN, B6)
- Improved form layout with labels
- Green "Book" buttons for clear call-to-action
- Better visual hierarchy
- Result count displayed

## 📱 How to Use

1. **Login/Register** to your account
2. **Select Departure Airport** from dropdown
3. **Select Destination Airport** from dropdown
4. **Choose Travel Date**
5. **Click Search** to see available flights
6. **Compare Prices** across 5 airlines
7. **Click "Book on [Airline]"** to complete booking on airline website

## 🔧 Technical Details

### Frontend Changes:
- Added `useEffect` hook to fetch airports on component mount
- Replaced text inputs with `<select>` dropdowns
- Added booking button with `window.open()` for external links
- Enhanced CSS for form groups and booking buttons

### Backend Changes:
- Added `/api/airports` endpoint
- Enhanced flight data with airline codes and booking URLs
- Returns structured airport data with code, name, and city

## 🚀 Access Your App

**URL:** http://13.158.138.216:8080

Make sure port 8080 is open in your AWS Security Group!

## 🎨 UI Improvements

- Form fields now have labels
- Dropdowns show clear airport information
- Airline codes displayed as badges
- Green booking buttons stand out
- Responsive grid layout
- Better spacing and visual hierarchy

## 🔮 Future Enhancements

Potential additions:
- Real-time flight data integration
- Price alerts
- Multi-city search
- Seat selection
- Baggage information
- Flight status tracking
- User booking history
- Favorite routes
- Price trends and analytics

---

**Current Version:** 1.1.0
**Last Updated:** February 25, 2026
