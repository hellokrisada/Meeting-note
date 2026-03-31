import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FLIGHT_API_PROVIDER = process.env.FLIGHT_API_PROVIDER || 'mock';
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const AMADEUS_CLIENT_ID = process.env.AMADEUS_CLIENT_ID;
const AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET;

// Mock flight data generator (fallback)
const airlines = [
  { name: 'United', code: 'UA', bookingUrl: 'https://www.united.com' },
  { name: 'Delta', code: 'DL', bookingUrl: 'https://www.delta.com' },
  { name: 'American', code: 'AA', bookingUrl: 'https://www.aa.com' },
  { name: 'Southwest', code: 'WN', bookingUrl: 'https://www.southwest.com' },
  { name: 'JetBlue', code: 'B6', bookingUrl: 'https://www.jetblue.com' },
  { name: 'Air France', code: 'AF', bookingUrl: 'https://www.airfrance.com' },
  { name: 'British Airways', code: 'BA', bookingUrl: 'https://www.britishairways.com' },
  { name: 'Lufthansa', code: 'LH', bookingUrl: 'https://www.lufthansa.com' },
  { name: 'Emirates', code: 'EK', bookingUrl: 'https://www.emirates.com' },
  { name: 'Qatar Airways', code: 'QR', bookingUrl: 'https://www.qatarairways.com' }
];

function generateMockFlights(from, to, date) {
  const numFlights = Math.floor(Math.random() * 5) + 5; // 5-10 flights
  const selectedAirlines = airlines.sort(() => 0.5 - Math.random()).slice(0, numFlights);
  
  return selectedAirlines.map((airline, idx) => ({
    id: `${airline.code}-${Date.now()}-${idx}`,
    airline: airline.name,
    airlineCode: airline.code,
    bookingUrl: airline.bookingUrl,
    from,
    to,
    date,
    price: Math.floor(Math.random() * 1000) + 150,
    duration: `${Math.floor(Math.random() * 10) + 2}h ${Math.floor(Math.random() * 60)}m`,
    departure: `${String(Math.floor(Math.random() * 12) + 6).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
    arrival: `${String(Math.floor(Math.random() * 12) + 12).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
    stops: Math.random() > 0.6 ? 0 : Math.floor(Math.random() * 2) + 1,
    class: 'Economy'
  }));
}

// SerpAPI - Google Flights Scraper
async function searchFlightsSerpAPI(from, to, date) {
  if (!SERPAPI_KEY) {
    throw new Error('SERPAPI_KEY not configured');
  }

  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        engine: 'google_flights',
        departure_id: from,
        arrival_id: to,
        outbound_date: date,
        currency: 'USD',
        hl: 'en',
        api_key: SERPAPI_KEY
      }
    });

    const flights = response.data.best_flights || response.data.other_flights || [];
    
    return flights.map((flight, idx) => {
      const firstFlight = flight.flights?.[0] || {};
      return {
        id: `${firstFlight.airline}-${Date.now()}-${idx}`,
        airline: firstFlight.airline || 'Unknown',
        airlineCode: firstFlight.airline_logo?.split('/').pop()?.split('.')[0] || 'XX',
        bookingUrl: flight.booking_token ? `https://www.google.com/travel/flights/booking?token=${flight.booking_token}` : '#',
        from,
        to,
        date,
        price: flight.price || 0,
        duration: flight.total_duration ? `${Math.floor(flight.total_duration / 60)}h ${flight.total_duration % 60}m` : 'N/A',
        departure: firstFlight.departure_airport?.time || 'N/A',
        arrival: firstFlight.arrival_airport?.time || 'N/A',
        stops: (flight.flights?.length || 1) - 1,
        class: 'Economy'
      };
    });
  } catch (error) {
    console.error('SerpAPI Error:', error.message);
    throw error;
  }
}

// Amadeus API
let amadeusToken = null;
let amadeusTokenExpiry = null;

async function getAmadeusToken() {
  if (amadeusToken && amadeusTokenExpiry && Date.now() < amadeusTokenExpiry) {
    return amadeusToken;
  }

  try {
    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: AMADEUS_CLIENT_ID,
        client_secret: AMADEUS_CLIENT_SECRET
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    amadeusToken = response.data.access_token;
    amadeusTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Refresh 1 min early
    return amadeusToken;
  } catch (error) {
    console.error('Amadeus Auth Error:', error.message);
    throw error;
  }
}

async function searchFlightsAmadeus(from, to, date) {
  if (!AMADEUS_CLIENT_ID || !AMADEUS_CLIENT_SECRET) {
    throw new Error('Amadeus credentials not configured');
  }

  try {
    const token = await getAmadeusToken();
    
    const response = await axios.get(
      'https://test.api.amadeus.com/v2/shopping/flight-offers',
      {
        params: {
          originLocationCode: from,
          destinationLocationCode: to,
          departureDate: date,
          adults: 1,
          max: 10
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const offers = response.data.data || [];
    
    return offers.map((offer, idx) => {
      const segment = offer.itineraries?.[0]?.segments?.[0] || {};
      const price = offer.price?.total || 0;
      
      return {
        id: `${segment.carrierCode}-${Date.now()}-${idx}`,
        airline: segment.carrierCode || 'Unknown',
        airlineCode: segment.carrierCode || 'XX',
        bookingUrl: `https://www.google.com/flights?q=${from}+to+${to}`,
        from,
        to,
        date,
        price: parseFloat(price),
        duration: segment.duration?.replace('PT', '').toLowerCase() || 'N/A',
        departure: segment.departure?.at?.split('T')[1]?.substring(0, 5) || 'N/A',
        arrival: segment.arrival?.at?.split('T')[1]?.substring(0, 5) || 'N/A',
        stops: (offer.itineraries?.[0]?.segments?.length || 1) - 1,
        class: 'Economy'
      };
    });
  } catch (error) {
    console.error('Amadeus API Error:', error.message);
    throw error;
  }
}

// Main search function
export async function searchFlights(from, to, date) {
  console.log(`Searching flights: ${from} -> ${to} on ${date} using ${FLIGHT_API_PROVIDER}`);
  
  try {
    switch (FLIGHT_API_PROVIDER) {
      case 'serpapi':
        return await searchFlightsSerpAPI(from, to, date);
      
      case 'amadeus':
        return await searchFlightsAmadeus(from, to, date);
      
      case 'mock':
      default:
        console.log('Using mock flight data');
        return generateMockFlights(from, to, date);
    }
  } catch (error) {
    console.error(`Flight search error (${FLIGHT_API_PROVIDER}):`, error.message);
    console.log('Falling back to mock data');
    return generateMockFlights(from, to, date);
  }
}

export default { searchFlights };
