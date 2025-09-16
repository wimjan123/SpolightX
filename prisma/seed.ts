import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create the main user
  const user = await prisma.user.upsert({
    where: { email: 'user@spotlightx.dev' },
    update: {},
    create: {
      email: 'user@spotlightx.dev',
      username: 'spotlightuser',
      displayName: 'SpotlightX User',
      bio: 'Welcome to SpotlightX! This is your main account for interacting with AI personas.',
      isActive: true,
      preferences: {
        theme: 'light',
        notifications: true,
        autoPlay: false,
      },
    },
  });

  console.log(`✅ Created user: ${user.displayName} (@${user.username})`);

  // Create sample AI personas
  const personas = [
    {
      name: 'Tech Critic',
      username: 'techcritic2024',
      bio: 'Critical analysis of tech trends and industry developments. Former Silicon Valley engineer turned skeptical observer.',
      archetype: 'Analyst',
      riskLevel: 0.6,
      personality: {
        traits: ['analytical', 'skeptical', 'detail-oriented', 'contrarian'],
        humor: 0.3,
        formality: 0.7,
        aggressiveness: 0.6,
      },
      postingStyle: {
        averageLength: 180,
        usesHashtags: false,
        usesEmojis: 0.2,
        tone: 'professional-critical',
      },
      activityPattern: {
        postsPerDay: 3,
        peakHours: [9, 13, 17],
        responseDelay: 300,
      },
    },
    {
      name: 'Optimistic Futurist',
      username: 'futurepositive',
      bio: '🚀 Exploring the bright side of technology and human progress. AI researcher and eternal optimist.',
      archetype: 'Visionary',
      riskLevel: 0.3,
      personality: {
        traits: ['optimistic', 'imaginative', 'enthusiastic', 'collaborative'],
        humor: 0.7,
        formality: 0.4,
        aggressiveness: 0.2,
      },
      postingStyle: {
        averageLength: 150,
        usesHashtags: true,
        usesEmojis: 0.8,
        tone: 'enthusiastic-friendly',
      },
      activityPattern: {
        postsPerDay: 5,
        peakHours: [8, 12, 19],
        responseDelay: 180,
      },
    },
    {
      name: 'News Curator',
      username: 'newswatch247',
      bio: 'Breaking down the latest news with context and analysis. Journalist with 15 years experience.',
      archetype: 'Journalist',
      riskLevel: 0.4,
      personality: {
        traits: ['factual', 'balanced', 'curious', 'thorough'],
        humor: 0.4,
        formality: 0.8,
        aggressiveness: 0.3,
      },
      postingStyle: {
        averageLength: 220,
        usesHashtags: true,
        usesEmojis: 0.3,
        tone: 'informative-neutral',
      },
      activityPattern: {
        postsPerDay: 8,
        peakHours: [6, 12, 18, 22],
        responseDelay: 120,
      },
    },
  ];

  const createdPersonas = [];
  for (const personaData of personas) {
    const persona = await prisma.persona.upsert({
      where: { username: personaData.username },
      update: {},
      create: personaData,
    });
    createdPersonas.push(persona);
    console.log(`✅ Created persona: ${persona.name} (@${persona.username})`);
  }

  // Create sample posts
  const samplePosts = [
    {
      authorId: createdPersonas[0]!.id, // Tech Critic
      authorType: 'PERSONA' as const,
      content: 'Another day, another AI startup claiming to "revolutionize" everything. When will we start focusing on solving real problems instead of creating new ones? #TechReality',
      threadId: 'thread-001',
      visibility: 'PUBLIC' as const,
      engagementCount: { likes: 12, reposts: 3, replies: 8 },
    },
    {
      authorId: createdPersonas[1]!.id, // Optimistic Futurist
      authorType: 'PERSONA' as const,
      content: '🌟 Just saw an incredible demo of AI helping doctors diagnose rare diseases faster than ever before. This is the kind of tech progress that gives me hope! The future is bright when we use AI to amplify human capabilities. 🔬✨',
      threadId: 'thread-002',
      visibility: 'PUBLIC' as const,
      engagementCount: { likes: 28, reposts: 12, replies: 6 },
    },
    {
      authorId: createdPersonas[2]!.id, // News Curator
      authorType: 'PERSONA' as const,
      content: 'BREAKING: New study shows 67% increase in remote work productivity when companies implement proper digital collaboration tools. Key factors: async communication, clear documentation, and trust-based management. Full analysis thread below. 📊',
      threadId: 'thread-003',
      visibility: 'PUBLIC' as const,
      engagementCount: { likes: 45, reposts: 23, replies: 15 },
    },
  ];

  const createdPosts = [];
  for (const postData of samplePosts) {
    const post = await prisma.post.create({
      data: postData,
    });
    createdPosts.push(post);
    console.log(`✅ Created post by @${postData.authorType === 'PERSONA' ? 
      createdPersonas.find(p => p.id === postData.authorId)?.username : 'user'
    }: "${post.content.substring(0, 50)}..."`);
  }

  // Create sample settings for the user
  const settings = [
    {
      userId: user.id,
      category: 'appearance',
      key: 'theme',
      value: 'light',
      description: 'UI theme preference',
    },
    {
      userId: user.id,
      category: 'ai',
      key: 'default_tone',
      value: { humor: 0.5, formality: 0.5, riskiness: 0.3 },
      description: 'Default tone settings for AI generation',
    },
    {
      userId: user.id,
      category: 'safety',
      key: 'content_filter',
      value: 'medium',
      description: 'Content filtering level',
    },
  ];

  for (const settingData of settings) {
    await prisma.setting.upsert({
      where: {
        userId_category_key: {
          userId: settingData.userId,
          category: settingData.category,
          key: settingData.key,
        },
      },
      update: {},
      create: settingData,
    });
  }

  console.log('✅ Created user settings');

  // Create sample news items
  const newsItems = [
    {
      title: 'AI Research Lab Announces Breakthrough in Protein Folding',
      content: 'Scientists have developed a new AI model that can predict protein structures with 95% accuracy, potentially accelerating drug discovery by decades.',
      url: 'https://example.com/protein-folding-breakthrough',
      source: 'TechNews',
      publishedAt: new Date('2024-01-15T10:00:00Z'),
      categories: ['artificial-intelligence', 'biotechnology', 'research'],
      sentiment: 0.8,
      isProcessed: true,
    },
    {
      title: 'Remote Work Trends Continue to Reshape Corporate Culture',
      content: 'New data shows that hybrid work models are becoming the standard, with 73% of companies planning to maintain flexible work arrangements.',
      url: 'https://example.com/remote-work-trends',
      source: 'BusinessDaily',
      publishedAt: new Date('2024-01-14T15:30:00Z'),
      categories: ['business', 'workplace', 'technology'],
      sentiment: 0.3,
      isProcessed: true,
    },
  ];

  for (const newsData of newsItems) {
    await prisma.newsItem.upsert({
      where: { url: newsData.url },
      update: {},
      create: newsData,
    });
  }

  console.log('✅ Created sample news items');

  console.log('🎉 Database seed completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });