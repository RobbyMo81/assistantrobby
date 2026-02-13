# OpenClaw Architecture Overview

This document outlines the current architecture of the OpenClaw project, focusing on the Node.js core, Python-based skills, and the data flow involving SQLite for short-term memory, with a planned integration of ChromaDB for long-term externalized memory.

## 1. Structural Overview

The OpenClaw system is primarily composed of a Node.js core application that manages various channels and agents. Skills, which can be implemented in Python, extend the functionality. Data persistence for short-term memory and vector indexing is currently handled by SQLite with the `sqlite-vec` extension. ChromaDB is envisioned as a future externalized memory layer for hybrid vector search.

```mermaid
graph TD
    User --> Channel(Channel - e.g., Discord, Telegram, Web)
    Channel --> NodeJsCore(Node.js Core Application)
    NodeJsCore --> Agent(Agent Logic)
    Agent --> SkillManagement(Skill Management)
    SkillManagement --> PythonSkills(Python Skills)
    SkillManagement --> SQLite(SQLite - Short-term Memory / Vector Index)
    PythonSkills --> SQLite
    Agent --> SQLite
    NodeJsCore --> Configuration(Configuration)
    NodeJsCore --> Logging(Logging)

    subgraph Future Integration
        NodeJsCore --> ChromaDB(ChromaDB - Long-term Externalized Memory)
        PythonSkills --> ChromaDB
        SQLite --> ChromaDB(Data Sync/Migration)
        ChromaDB --> Agent(Hybrid Search via RRF)
    end
```

## 2. Implementation Logic (Example: Message Processing with Memory Retrieval)

This sequence diagram illustrates a typical flow when a user message is processed, involving agent logic and memory retrieval from SQLite. It also indicates where ChromaDB would eventually be integrated for hybrid search.

```mermaid
sequenceDiagram
    participant U as User
    participant C as Channel (e.g., Web, Discord)
    participant NCC as Node.js Core
    participant AL as Agent Logic
    participant SM as Skill Management
    participant PS as Python Skill
    participant SQL as SQLite (Short-term Memory)
    participant CDB as ChromaDB (Long-term Memory)

    U->>C: Sends Message
    C->>NCC: Inbound Message
    NCC->>AL: Process Message
    AL->>SQL: Query Short-term Memory (vector search via sqlite-vec)
    SQL-->>AL: Relevant Short-term Context
    alt With Future ChromaDB Integration
        AL->>CDB: Query Long-term Memory (vector search)
        CDB-->>AL: Relevant Long-term Context
        AL->>AL: Apply RRF (Reciprocal Rank Fusion)
    end
    AL->>SM: Determine Skill Usage (if any)
    opt If Skill Needed
        SM->>PS: Invoke Python Skill (with context)
        PS->>SQL: Read/Write Skill-specific Data
        SQL-->>PS: Data
        PS-->>SM: Skill Result
    end
    SM-->>AL: Final Agent Response
    AL->>NCC: Render Response
    NCC->>C: Outbound Message
    C-->>U: Displays Response
```

## 3. Module Responsibilities

### Node.js Core Application
*   **Channels:** Handles inbound and outbound communication with external platforms (e.g., Discord, Telegram, WebSockets).
*   **Agent Logic:** Orchestrates the processing of messages, decision-making, and interaction with skills and memory.
*   **Skill Management:** Discovers, loads, and manages the execution of various skills, acting as a bridge between the Node.js core and potentially external skill environments (like Python).
*   **Memory Management:** Manages the interaction with the underlying data stores (currently SQLite, with planned ChromaDB integration). This includes embedding generation, indexing, storage, and retrieval.
*   **Configuration:** Manages application settings and agent-specific configurations.
*   **Logging:** Handles structured logging throughout the system.
*   **CLI:** Provides command-line interface for interaction and management.

### Python Skills
*   **Specialized Functionality:** Provides domain-specific logic and capabilities that extend the core agent's functionality.
*   **Data Interaction:** May interact with SQLite for skill-specific data persistence or external APIs.
*   **Python Execution Bridge:** Relies on the Node.js core's skill management to invoke Python scripts and exchange data.

### SQLite (Short-term Memory / Vector Index)
*   **Ephemeral Data Storage:** Stores recent conversational context, session-specific data, and agent states.
*   **Vector Indexing:** Utilizes `sqlite-vec` for efficient vector similarity search on embeddings derived from short-term memory.
*   **QMD Management:** Manages and queries indexed markdown content.

### ChromaDB (Long-term Externalized Memory - Planned)
*   **Scalable Vector Store:** Intended to provide a more robust and scalable solution for storing and retrieving vector embeddings for long-term memory.
*   **Hybrid Search Integration:** Will be integrated with SQLite via a Reciprocal Rank Fusion (RRF) strategy to combine results from both short-term and long-term memory.
*   **Externalized Persistence:** Provides a dedicated, potentially external service for persistent vector storage.
