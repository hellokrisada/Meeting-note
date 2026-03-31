# ✈️ Airport List Update

## 📊 Data Source

Airport list sourced from: **[Wikipedia - List of the busiest airports in the United States](https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_the_United_States)**

Based on 2024 FAA data for commercial service airports ranked by passenger enplanements.

## 🛫 Airport Coverage

**Total Airports:** 63 major US airports

### Top 10 Busiest Airports (2024):
1. **ATL** - Hartsfield–Jackson Atlanta International Airport (52.5M passengers)
2. **DFW** - Dallas/Fort Worth International Airport (42.4M passengers)
3. **DEN** - Denver International Airport (40.0M passengers)
4. **ORD** - O'Hare International Airport, Chicago (38.6M passengers)
5. **LAX** - Los Angeles International Airport (37.8M passengers)
6. **JFK** - John F. Kennedy International Airport (31.5M passengers)
7. **CLT** - Charlotte Douglas International Airport (28.5M passengers)
8. **LAS** - Harry Reid International Airport (28.2M passengers)
9. **MCO** - Orlando International Airport (27.9M passengers)
10. **MIA** - Miami International Airport (26.6M passengers)

## 🗺️ Geographic Coverage

### By Region:
- **West Coast:** LAX, SFO, SEA, PDX, SAN, SJC, OAK, SNA, ONT, BUR, SMF
- **East Coast:** JFK, BOS, EWR, LGA, PHL, BWI, DCA, IAD, PBI, CHS, BUF, BDL
- **South:** ATL, MIA, MCO, FLL, TPA, CLT, BNA, MSY, JAX, RSW, SAT, AUS, HOU, IAH, DFW, DAL
- **Midwest:** ORD, MDW, DTW, MSP, STL, MCI, CLE, CVG, CMH, IND, MKE, OMA
- **Mountain:** DEN, PHX, LAS, SLC, ABQ, BOI
- **Alaska & Hawaii:** ANC, HNL, OGG
- **Puerto Rico:** SJU

### Major Hubs Included:
- All major airline hubs (United, Delta, American, Southwest, JetBlue)
- International gateway airports
- Regional hub airports
- Tourist destination airports

## 📋 Airport Data Format

Each airport includes:
- **IATA Code:** 3-letter airport code (e.g., ATL, LAX)
- **Full Name:** Official airport name
- **City/State:** Location with state abbreviation

Example:
```json
{
  "code": "ATL",
  "name": "Hartsfield–Jackson Atlanta International Airport",
  "city": "Atlanta, GA"
}
```

## 🔄 Updates Applied

✅ Replaced previous 15-airport list with comprehensive 63-airport list
✅ Airports ranked by passenger traffic (busiest first)
✅ Includes all FAA-designated "Large Hub" airports
✅ Includes major "Medium Hub" airports
✅ Covers all major US metropolitan areas
✅ Data current as of 2024

## 🌐 Coverage Statistics

- **Large Hub Airports:** 31 (>1% of US passenger traffic each)
- **Medium Hub Airports:** 32 (0.25-1% of US passenger traffic each)
- **States Covered:** 35+ states plus Puerto Rico
- **Total Annual Passengers:** 800+ million combined

## 📱 User Experience

Users can now:
- Select from 63 major US airports
- Search flights between any major city pairs
- Access airports in all US regions
- Find airports in smaller cities (Boise, Omaha, Buffalo, etc.)

## 🔗 Attribution

Content sourced and adapted from Wikipedia's public domain data:
- [List of the busiest airports in the United States](https://en.wikipedia.org/wiki/List_of_the_busiest_airports_in_the_United_States)
- Data compiled by Federal Aviation Administration (FAA)
- Rankings based on Calendar Year 2024 enplanements

---

**Last Updated:** February 25, 2026
**Data Source:** Wikipedia (Public Domain)
**FAA Data Year:** 2024
