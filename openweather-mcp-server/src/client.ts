import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure dotenv
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Define interfaces for typed responses
interface WeatherResponse {
  location_found: string;
  description: string;
  temperature: number;
  feels_like: number;
  humidity_percent: number;
  wind_speed: number;
  units: string;
}

interface GeocodingResponse {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: string[];
  latitude: string;
  longitude: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
}

// Define a simple interface for the response from MCP server tools
// This is intentionally loose to work with various response formats
interface MCPResponse {
  content?: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    [key: string]: any;
  }>;
  [key: string]: any;
}

async function runClient() {
  console.log("Starting MCP client test (SSE against server)...");

  // Use local server for testing, or fallback to deployed URL
  const useLocal = true; // Change to true to test against local server
  
  // Configure server URL
  const serverBaseUrl = useLocal 
    ? 'http://localhost:8000'
    : 'https://z3neqkdrhv.us-east-1.awsapprunner.com';
    
  const sseUrl = `${serverBaseUrl}/sse`;
  
  console.log(`Connecting to server at: ${serverBaseUrl}`);
  
  try {
    // Create SSE transport and client
    const transport = new SSEClientTransport(new URL(sseUrl));
    
    const client = new Client(
      {
        name: "openweather-sse-client",
        version: "0.1.0"
      },
      {
        capabilities: {}
      }
    );

    // Connect to the server via SSE
    console.log(`Connecting client to server via SSE...`);
    await client.connect(transport);
    console.log("Client connected successfully.");

    // List tools
    console.log("\nListing available tools...");
    const toolsList = await client.listTools();
    console.log("Server Capabilities:", JSON.stringify(client.getServerCapabilities() ?? {}, null, 2));
    console.log("Tools available:", JSON.stringify(toolsList.tools, null, 2));    // Call Weather tool
    console.log("\nCalling get_current_weather...");
    const weatherArgs = { location: "Tokyo, Japan", units: "metric" as const };
    const weatherResult: MCPResponse = await client.callTool({ name: "get_current_weather", arguments: weatherArgs });
    
    if (weatherResult.content?.[0]?.type === 'text') {
      try {
        const textContent = weatherResult.content[0].text as string;
        const parsedWeather = JSON.parse(textContent) as WeatherResponse;
        console.log("Weather Result:");
        console.log(`  Location: ${parsedWeather.location_found}`);
        console.log(`  Description: ${parsedWeather.description}`);
        console.log(`  Temperature: ${parsedWeather.temperature}°C`);
        console.log(`  Feels like: ${parsedWeather.feels_like}°C`);
        console.log(`  Humidity: ${parsedWeather.humidity_percent}%`);
        console.log(`  Wind speed: ${parsedWeather.wind_speed} m/s`);
      } catch (err) {
        console.error("Error parsing weather response:", err);
        console.log("Raw weather response:", weatherResult.content?.[0]?.text || "No text content available");
      }
    }    // Call Geocoding tool
    console.log("\nCalling find_location_info...");
    const geoArgs = { query: "Statue of Liberty" };
    const geoResult = await client.callTool({ name: "find_location_info", arguments: geoArgs }) as MCPResponse;
    
    if (geoResult.content?.[0]?.type === 'text') {
      try {
        const textContent = geoResult.content[0].text as string;
        const parsedGeo = JSON.parse(textContent) as GeocodingResponse;
        console.log("Geocoding Result:");
        console.log(`  Display name: ${parsedGeo.display_name}`);
        console.log(`  Coordinates: ${parsedGeo.latitude}, ${parsedGeo.longitude}`);
        console.log(`  OSM type: ${parsedGeo.osm_type}`);
        console.log(`  Place ID: ${parsedGeo.place_id}`);
      } catch (err) {
        console.error("Error parsing geocoding response:", err);
        console.log("Raw geocoding response:", geoResult.content?.[0]?.text || "No text content available");
      }
    }

  } catch (error) {
    console.error("\nClient encountered an error:", error);
  } finally {
    // Exit process (needed for ES modules)
    console.log("\nClient test completed.");
    process.exit(0);
  }
}

// Run the client
runClient().catch(err => {
  console.error("Unhandled error in client:", err);
  process.exit(1);
});