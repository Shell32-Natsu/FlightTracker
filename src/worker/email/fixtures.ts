/** 测试用邮件样本。 */

/** Gmail 标记文档里的 FlightReservation 示例（略改），外加一段取消的。 */
export const JSONLD_HTML = `<html><head>
<script type="application/ld+json">
[{
  "@context": "http://schema.org",
  "@type": "FlightReservation",
  "reservationNumber": "RXJ34P",
  "reservationStatus": "http://schema.org/ReservationConfirmed",
  "underName": {"@type": "Person", "name": "Eva Green"},
  "airplaneSeat": "9a",
  "airplaneSeatClass": {"@type": "AirplaneSeatClass", "name": "Business"},
  "reservationFor": {
    "@type": "Flight",
    "flightNumber": "110",
    "airline": {"@type": "Airline", "name": "United", "iataCode": "UA"},
    "departureAirport": {"@type": "Airport", "name": "San Francisco Airport", "iataCode": "SFO"},
    "departureTime": "2027-03-04T20:15:00-08:00",
    "arrivalAirport": {"@type": "Airport", "name": "John F. Kennedy International Airport", "iataCode": "JFK"},
    "arrivalTime": "2027-03-05T06:30:00-05:00"
  }
}, {
  "@context": "http://schema.org",
  "@type": "FlightReservation",
  "reservationNumber": "RXJ34P",
  "reservationStatus": "ReservationCancelled",
  "reservationFor": {
    "@type": "Flight",
    "flightNumber": "UA 111",
    "departureAirport": {"@type": "Airport", "iataCode": "JFK"},
    "departureTime": "2027-03-10T08:00",
    "arrivalAirport": {"@type": "Airport", "iataCode": "SFO"}
  }
}]
</script></head><body><p>Your trip &amp; receipt</p></body></html>`;
