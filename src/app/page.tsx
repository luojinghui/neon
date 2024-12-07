import { Container } from '@/components/container';
import { Box } from '@/components/box';
import { Footer } from '@/components/footer';

export default function Home() {
  return (
    <div className="h-screen bg12 overflow-hidden">
      <Container className="h-full relative">
        <Box className="pt-20">
          <div className="relative">
            <div className="text-6xl text-white font-medium text-center">Soul Planet</div>
            <div className="mt-6 text-base text-white font-medium text-center">生命就该浪费在美好的事物上</div>
          </div>
        </Box>
      </Container>

      <Container className="w-full fixed bottom-0 center">
        <Footer />
      </Container>
    </div>
  );
}
