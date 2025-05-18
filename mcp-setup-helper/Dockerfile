FROM python:3.11-slim

WORKDIR /app

# Copy requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the port the server listens on
EXPOSE 8080

# Launch the MCP server
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8080"]
