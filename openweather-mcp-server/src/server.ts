import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import axios from "axios";
import * as dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto'; 
import cors from 'cors';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure dotenv - use proper path resolution in ES modules
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log("Initializing MCP server logic...");

const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;
if (!OPENWEATHERMAP_API_KEY) {
  console.warn("Warning: OPENWEATHERMAP_API_KEY environment variable is not set. Weather API calls will fail.");
}

const PORT = process.env.PORT || 8000;

// Create MCP server logic instance
const mcpLogic = new McpServer({
  name: "openweather-mcp-server",
  version: "0.1.0",
  description: "Provides weather and geocoding tools via public APIs",
});

// Define response types for better type safety
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

// --- Tool Definitions with improved typing --- //
const weatherRawShape = {
  location: z.string().describe("The city and state/country, e.g., \"San Francisco, CA\" or \"London, UK\""),
  units: z.enum(["metric", "imperial", "standard"]).optional().default("metric").describe("Units for temperature (metric=Celsius, imperial=Fahrenheit, standard=Kelvin). Defaults to metric."),
};
const weatherSchema = z.object(weatherRawShape);
type WeatherParams = z.infer<typeof weatherSchema>;

mcpLogic.tool(
  "get_current_weather",
  weatherRawShape,
  async (params: WeatherParams): Promise<{ content: { type: "text", text: string }[] }> => {
    console.log(`Executing get_current_weather with params:`, params);
    const { location, units } = params;
    
    if (!OPENWEATHERMAP_API_KEY) {
      throw new Error("Server configuration error: Weather API key missing.");
    }
    
    const apiUrl = "http://api.openweathermap.org/data/2.5/weather";
    const apiParams = { q: location, appid: OPENWEATHERMAP_API_KEY, units: units };
    
    try {
      const response = await axios.get(apiUrl, { params: apiParams });
      const data = response.data as any; // Type assertion needed for API response
      
      if (data.cod !== 200) {
        throw new Error(`Weather API error: ${data.message || "Unknown error"}`);
      }
      
      const mainWeather = data.weather?.[0] || {};
      const mainTemp = data.main || {};
      
      const result: WeatherResponse = {
        location_found: data.name,
        description: mainWeather.description || "Unknown",
        temperature: mainTemp.temp || 0,
        feels_like: mainTemp.feels_like || 0,
        humidity_percent: mainTemp.humidity || 0,
        wind_speed: data.wind?.speed || 0,
        units: units
      };
      
      console.log(`Successfully fetched weather for '${location}'`);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || "Unknown error";
      console.error(`Weather API error:`, message);
      throw new Error(`Failed to get weather: ${message}`);
    }
  }
);

const geocodingRawShape = {
  query: z.string().describe("The place name or address to search for, e.g., \"Eiffel Tower\""),
};
const geocodingSchema = z.object(geocodingRawShape);
type GeocodingParams = z.infer<typeof geocodingSchema>;

mcpLogic.tool(
  "find_location_info",
  geocodingRawShape,
  async (params: GeocodingParams): Promise<{ content: { type: "text", text: string }[] }> => {
    console.log(`Executing find_location_info with params:`, params);
    const { query } = params;
    
    const apiUrl = "https://nominatim.openstreetmap.org/search";
    const apiParams = { q: query, format: "json", limit: 1 };
    const headers = { "User-Agent": "openweather-mcp-server/0.1 (djurhuusdata-site)" };
    
    try {
      const response = await axios.get(apiUrl, { params: apiParams, headers: headers });
      const data = response.data as any[]; // Type assertion needed for API response
      
      if (!data || data.length === 0) {
        throw new Error(`No results found for '${query}'`);
      }
      
      const topResult = data[0];
      const result: GeocodingResponse = {
        place_id: topResult.place_id,
        licence: topResult.licence,
        osm_type: topResult.osm_type,
        osm_id: topResult.osm_id,
        boundingbox: topResult.boundingbox,
        latitude: topResult.lat,
        longitude: topResult.lon,
        display_name: topResult.display_name,
        class: topResult.class,
        type: topResult.type,
        importance: topResult.importance
      };
      
      console.log(`Successfully geocoded query: '${query}'`);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || "Unknown error";
      console.error(`Geocoding API error:`, message);
      throw new Error(`Failed during geocoding: ${message}`);
    }
  }
);

// --- Express + SSE Server Setup with improved error handling --- //

console.log("Setting up Express server...");
const app = express();

// Apply CORS middleware BEFORE routes
app.use(cors({
  origin: '*', // Configure for production environments
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Track active transports
const transports: Record<string, SSEServerTransport> = {};

// SSE endpoint for clients to connect
app.get("/sse", async (req: Request, res: Response) => {
  console.log("SSE connection requested");
  
  // Set headers needed for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const sessionId = randomUUID();
    console.log(`Creating SSE transport for sessionId: ${sessionId}`);
    
    // Create SSE transport
    const transport = new SSEServerTransport('/messages', res);
    const transportSessionId = transport.sessionId || sessionId;
    transports[transportSessionId] = transport;
    console.log(`Transport stored with sessionId: ${transportSessionId}`);

    // Clean up on connection close
    req.on("close", () => {
      console.log(`SSE connection closed for sessionId: ${transportSessionId}`);
      delete transports[transportSessionId];
    });

    // Connect MCP logic to transport
    await mcpLogic.connect(transport);
    console.log(`MCP logic connected to transport for sessionId: ${transportSessionId}`);

  } catch (error) {
    console.error("Error setting up SSE connection:", error);
    if (!res.headersSent) {
      res.status(500).send('Failed to establish SSE connection');
    }
  }
});

// Endpoint for clients to send messages to the server
app.post("/messages", async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.query.sessionId as string;
  console.log(`Received POST message for sessionId: ${sessionId}`);
  
  if (!sessionId) {
    res.status(400).send('Missing sessionId query parameter');
    return;
  }

  const transport = transports[sessionId];
  if (transport) {
    try {
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error(`Error handling POST message for sessionId ${sessionId}:`, error);
      if (!res.headersSent) {
        res.status(500).send('Error processing message');
      }
    }
  } else {
    console.warn(`No active transport found for sessionId: ${sessionId}`);
    res.status(404).send('No active session found for sessionId');
  }
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handler middleware
app.use((err: any, req: Request, res: Response, next: Function) => {
  console.error("Express error handler caught:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message || "Unknown error"
  });
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`MCP Server with Express listening on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Message endpoint: http://localhost:${PORT}/messages`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
